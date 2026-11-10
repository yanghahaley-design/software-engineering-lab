# 数字银行核心业务模拟系统

本仓库包含：

- `backend/digital-bank`：Spring Boot 后端
- `frontend`：数字银行 Web 前端
- `.github/workflows/deploy-pages.yml`：GitHub Pages 自动部署

## GitHub Pages 演示

前端部署到 GitHub Pages 后，使用浏览器内置演示数据运行，不依赖本地数据库：

- 客户：`demo / Bank@2026`
- 管理员：`admin / Admin@2026`

演示支持登录、账户总览、存款、取款、行内转账、跨行转账、风控结果、交易记录和管理员复核。数据保存在当前浏览器的 `localStorage` 中。

## 本地预览前端

```powershell
cd frontend
python -m http.server 8090
```

访问 `http://127.0.0.1:8090/?demo=1`。

本地直接访问 `http://127.0.0.1:8090/` 时同样会使用静态演示数据。作为普通静态文件打开时也会启用演示数据。

静态演示数据层可单独测试：

```powershell
node --test tests/demo-api.test.mjs
```

## 启动后端

```powershell
cd backend/digital-bank
.\mvnw.cmd spring-boot:run
```

后端默认端口为 `8081`。

## 部署说明

推送到 `master` 分支后，`.github/workflows/deploy-pages.yml` 会把 `frontend` 目录发布为 GitHub Pages 站点。仓库的 Pages 发布源需要设置为 **GitHub Actions**。
