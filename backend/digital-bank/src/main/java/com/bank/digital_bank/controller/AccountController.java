package com.bank.digital_bank.controller;

import com.bank.digital_bank.entity.Transaction;
import com.bank.digital_bank.service.AccountService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
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
}
