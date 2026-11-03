package com.bank.digital_bank.repository;

import com.bank.digital_bank.entity.Account;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface AccountRepository extends JpaRepository<Account, Long> {

    /**
     * 以悲观写锁读取账户，防止并发资金操作基于旧余额更新。
     * 锁会在调用方的事务提交或回滚时释放。
     * 返回 Optional 以便调用方显式处理账户不存在的情况。
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select account from Account account where account.id = :accountId")
    Optional<Account> findByIdForUpdate(@Param("accountId") Long accountId);
}
