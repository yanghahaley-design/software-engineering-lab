package com.bank.digital_bank.repository;

import com.bank.digital_bank.entity.Account;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AccountRepository extends JpaRepository<Account, Long> {

    /**
     * 以悲观写锁读取账户，防止多个并发存款请求同时基于旧余额更新。
     * 锁会在调用方的事务提交或回滚时释放。
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select account from Account account where account.id = :accountId")
    Account findByIdForUpdate(@Param("accountId") Long accountId);
}
