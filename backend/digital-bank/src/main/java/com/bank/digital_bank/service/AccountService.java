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

@Service
public class AccountService {

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
        // 先校验账户是否存在；查询时加写锁，确保并发存款按最新余额依次计算。
        Account account = accountRepository.findByIdForUpdate(accountId);
        if (account == null) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND, "账户不存在，accountId=" + accountId);
        }

        // 金额为空或小于等于 0 都不允许入账，抛出异常使事务回滚。
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "存款金额必须大于 0");
        }

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
}
