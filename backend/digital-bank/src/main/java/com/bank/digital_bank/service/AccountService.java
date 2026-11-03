package com.bank.digital_bank.service;

import com.bank.digital_bank.entity.Account;
import com.bank.digital_bank.entity.Transaction;
import com.bank.digital_bank.repository.AccountRepository;
import com.bank.digital_bank.repository.TransactionRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.List;

@Service
public class AccountService {

    private static final BigDecimal MAX_TRANSFER_AMOUNT = new BigDecimal("50000");

    private final AccountRepository accountRepository;
    private final TransactionRepository transactionRepository;

    public AccountService(AccountRepository accountRepository,
                          TransactionRepository transactionRepository) {
        this.accountRepository = accountRepository;
        this.transactionRepository = transactionRepository;
    }

    /**
     * 为指定账户办理存款，并在同一个数据库事务中更新余额和保存流水。
     *
     * @param accountId 要存款的账户 ID
     * @param amount    存款金额，必须大于 0
     * @return 已保存的存款流水
     */
    @Transactional
    public Transaction deposit(Long accountId, BigDecimal amount) {
        if (accountId == null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "账户 ID 不能为空");
        }

        // 先校验账户是否存在；查询时加写锁，确保并发存款按最新余额依次计算。
        Account account = accountRepository.findByIdForUpdate(accountId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "账户不存在，accountId=" + accountId));

        // 金额为空或小于等于 0 都不允许入账，抛出异常使事务回滚。
        requirePositiveAmount(amount, "存款金额");

        // 计算并更新账户余额；账户实体处于当前事务管理中，保存操作会参与本事务。
        BigDecimal newBalance = account.getBalance().add(amount);
        account.setBalance(newBalance);
        accountRepository.save(account);

        // 创建与余额更新处于同一事务的存款流水，记录金额及入账后的余额。
        Transaction transaction = new Transaction();
        transaction.setTransType("DEPOSIT");
        transaction.setAmount(amount);
        transaction.setBalanceAfter(newBalance);
        transaction.setAccount(account);

        return transactionRepository.save(transaction);
    }

    /**
     * 在同一个事务中完成转出、转入和两条流水的创建。
     *
     * @param fromAccountId 转出账户 ID
     * @param toAccountId   转入账户 ID
     * @param amount        转账金额，必须大于 0 且不超过 50000
     * @return 按转出、转入顺序排列的两条流水记录
     */
    @Transactional
    public List<Transaction> transfer(Long fromAccountId, Long toAccountId, BigDecimal amount) {
        // 在访问账户前先验证金额和转账风控阈值，确保非法请求不会产生行锁和数据变更。
        requirePositiveAmount(amount, "转账金额");
        if (amount.compareTo(MAX_TRANSFER_AMOUNT) > 0) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "单笔转账金额不能超过 50000");
        }
        if (fromAccountId == null || toAccountId == null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "转出账户和转入账户 ID 不能为空");
        }
        if (fromAccountId.equals(toAccountId)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "转出账户和转入账户不能相同");
        }

        // 按账户 ID 从小到大加锁，保证并发的反向转账也按相同顺序获取锁，降低死锁风险。
        boolean fromAccountLockedFirst = fromAccountId.compareTo(toAccountId) < 0;
        Long firstAccountId = fromAccountLockedFirst ? fromAccountId : toAccountId;
        Long secondAccountId = fromAccountLockedFirst ? toAccountId : fromAccountId;
        Account firstAccount = lockAccount(firstAccountId, fromAccountId, toAccountId);
        Account secondAccount = lockAccount(secondAccountId, fromAccountId, toAccountId);

        // 根据加锁顺序还原出转出账户和转入账户。
        Account fromAccount = fromAccountLockedFirst ? firstAccount : secondAccount;
        Account toAccount = fromAccountLockedFirst ? secondAccount : firstAccount;

        // 两个账户都必须处于可交易的正常状态。
        if (!isNormalStatus(fromAccount.getStatus())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "转出账户状态异常，无法转账");
        }
        if (!isNormalStatus(toAccount.getStatus())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "转入账户状态异常，无法转账");
        }

        // 检查转出账户余额，余额不足时抛出异常，事务不会产生任何变更。
        if (fromAccount.getBalance().compareTo(amount) < 0) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "转出账户余额不足");
        }

        // 计算两侧的新余额，并在当前事务中更新账户。
        BigDecimal fromBalanceAfter = fromAccount.getBalance().subtract(amount);
        BigDecimal toBalanceAfter = toAccount.getBalance().add(amount);
        fromAccount.setBalance(fromBalanceAfter);
        toAccount.setBalance(toBalanceAfter);
        accountRepository.saveAll(List.of(fromAccount, toAccount));

        // 创建转出和转入两条流水；流水金额均记录为正数，类型区分资金方向。
        Transaction debitTransaction = createTransferTransaction(
                fromAccount, "TRANSFER_OUT", amount, fromBalanceAfter);
        Transaction creditTransaction = createTransferTransaction(
                toAccount, "TRANSFER_IN", amount, toBalanceAfter);
        return transactionRepository.saveAll(List.of(debitTransaction, creditTransaction));
    }

    /**
     * 以悲观写锁读取账户；账户不存在时抛出 404 异常。
     * 异常信息会指明该账户是转出方还是转入方，便于前端定位问题。
     */
    private Account lockAccount(Long accountId, Long fromAccountId, Long toAccountId) {
        String accountRole = accountId.equals(fromAccountId) ? "转出账户" : "转入账户";
        return accountRepository.findByIdForUpdate(accountId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, accountRole + "不存在，accountId=" + accountId));
    }

    /**
     * 校验资金操作金额必须大于 0，不合法时抛出 400 异常以触发事务回滚。
     */
    private void requirePositiveAmount(BigDecimal amount, String amountLabel) {
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, amountLabel + "必须大于 0");
        }
    }

    /**
     * 兼容项目中可能采用的中文和英文正常状态表示。
     */
    private boolean isNormalStatus(String status) {
        return "正常".equals(status)
                || "NORMAL".equalsIgnoreCase(status)
                || "ACTIVE".equalsIgnoreCase(status);
    }

    /**
     * 根据账户及其转账后余额构建一条流水实体。
     */
    private Transaction createTransferTransaction(Account account,
                                                  String transType,
                                                  BigDecimal amount,
                                                  BigDecimal balanceAfter) {
        Transaction transaction = new Transaction();
        transaction.setTransType(transType);
        transaction.setAmount(amount);
        transaction.setBalanceAfter(balanceAfter);
        transaction.setAccount(account);
        return transaction;
    }
}
