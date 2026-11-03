package com.bank.digital_bank;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class TestController {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @GetMapping("/test-db")
    public String testDb() {
        try {
            // 尝试从 users 表里查询总数
            Integer count = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM users", Integer.class);
            return "🎉 太棒了！数据库连接成功！当前 users 表里有 " + count + " 条数据。";
        } catch (Exception e) {
            return "❌ 数据库连接失败，错误信息：" + e.getMessage();
        }
    }
}