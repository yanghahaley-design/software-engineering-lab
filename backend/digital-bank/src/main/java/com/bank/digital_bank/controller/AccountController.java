package com.bank.digital_bank.controller;

import com.bank.digital_bank.entity.Transaction;
import com.bank.digital_bank.service.AccountService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/account")
public class AccountController {

    private final AccountService accountService;

    public AccountController(AccountService accountService) {
        this.accountService = accountService;
    }

    /**
     * 接收账户 ID 和存款金额，调用业务层完成余额更新与流水创建。
     * 参数通过 POST 请求的查询参数或表单参数传入，例如：
     * /api/account/deposit?accountId=1&amount=100.00
     *
     * @param accountId 要存款的账户 ID
     * @param amount    存款金额
     * @return 存款结果，包括流水 ID 和存款后的账户余额
     */
    @PostMapping("/deposit")
    public Map<String, Object> deposit(@RequestParam Long accountId,
                                       @RequestParam BigDecimal amount) {
        // 由服务层统一执行校验、加锁和事务处理。
        Transaction transaction = accountService.deposit(accountId, amount);

        // 只返回必要的流水数据，避免将包含双向关联的 JPA 实体直接序列化。
        return Map.of(
                "message", "存款成功",
                "transactionId", transaction.getId(),
                "accountId", accountId,
                "amount", transaction.getAmount(),
                "balanceAfter", transaction.getBalanceAfter()
        );
    }

    /**
     * 办理账户间转账，请求体示例：
     * {"fromAccountId":1,"toAccountId":2,"amount":100.00}
     *
     * @param request 转出账户、转入账户和转账金额
     * @return 转账结果及两侧更新后的余额
     */
    @PostMapping("/transfer")
    public Map<String, Object> transfer(@RequestBody TransferRequest request) {
        // 服务层在事务中完成所有校验、账户余额更新及双流水创建。
        List<Transaction> transactions = accountService.transfer(
                request.fromAccountId(), request.toAccountId(), request.amount());

        Transaction debitTransaction = transactions.get(0);
        Transaction creditTransaction = transactions.get(1);
        return Map.of(
                "message", "转账成功",
                "fromAccountId", request.fromAccountId(),
                "toAccountId", request.toAccountId(),
                "amount", request.amount(),
                "fromBalanceAfter", debitTransaction.getBalanceAfter(),
                "toBalanceAfter", creditTransaction.getBalanceAfter(),
                "debitTransactionId", debitTransaction.getId(),
                "creditTransactionId", creditTransaction.getId()
        );
    }

    /**
     * 转账请求体，字段名与接口要求的参数名保持一致。
     */
    public record TransferRequest(Long fromAccountId, Long toAccountId, BigDecimal amount) {
    }
}
