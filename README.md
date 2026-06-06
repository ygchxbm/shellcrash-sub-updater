# ShellCrash Sub Updater

Convert a v2rayN/V2Ray raw subscription into Clash/Mihomo YAML on your local machine, then optionally upload it to ShellCrash on your router.

适用场景：

- 订阅地址在 v2rayN 中可用，但不能直接作为 Clash/ShellCrash 订阅导入
- 你希望转换过程只在本机完成，不依赖公共订阅转换服务
- 你希望把 YAML 一键推送到路由器上的 ShellCrash

这个项目提供两种工作流：

- CLI：适合脚本化和固定流程
- Web UI：适合临时修改订阅、下载 YAML、手动挑选 YAML 上传

## 特性

- 本机调用 subconverter，不依赖公共订阅转换服务
- 支持仅生成 Clash/Mihomo YAML
- 支持把生成的 YAML 上传到路由器 ShellCrash
- 支持在 Web 页面选择已有 YAML 并上传
- 上传前自动备份路由器旧配置
- 上传后用 ShellCrash 当前 Mihomo 核心测试配置，通过后再重启

## 要求

- Node.js 18 或更高版本
- 本机可通过 SSH 登录路由器
- 路由器已安装 ShellCrash
- macOS/Linux 需要系统有 `ssh`、`scp`、`tar`
- Windows 第一次需要手动解压 subconverter，见下方说明

## 快速开始

```bash
git clone https://github.com/ygchxbm/shellcrash-sub-updater.git
cd shellcrash-sub-updater
cp config.example.json config.json
```

编辑 `config.json`：

```json
{
  "subscriptionUrl": "https://example.com/your-v2ray-subscription",
  "router": {
    "host": "192.168.31.1",
    "user": "root",
    "privateKey": "./id_rsa"
  }
}
```

只生成 YAML：

```bash
npm run convert
```

生成并上传到 ShellCrash：

```bash
npm run update
```

启动 Web 页面：

```bash
npm start
```

然后打开：

```text
http://127.0.0.1:3000
```

## 常见流程

只想拿到 YAML 文件：

```bash
npm run convert
```

想把订阅直接更新到路由器：

```bash
npm run update
```

已经有 YAML 文件，只想上传到 ShellCrash：

```bash
npm run upload
```

## 配置说明

`config.json` 不应该提交到 Git。项目默认用 `.gitignore` 忽略它。

常用字段：

- `subscriptionUrl`：v2rayN/V2Ray 原始订阅地址
- `router.host`：路由器 IP
- `router.user`：SSH 用户，通常是 `root`
- `router.privateKey`：SSH 私钥路径
- `paths.localYaml`：生成的本地 YAML 路径
- `restartShellCrash`：上传成功后是否重启 ShellCrash

`known_hosts` 是项目运行时自动维护的本地 SSH 指纹文件，用来校验你连接的路由器身份，不需要手动创建，也不应提交到 Git。

小米/OpenWrt 老版本 Dropbear 如果只支持 `ssh-rsa`，可保留示例里的：

```json
"sshOptions": [
  "-o", "HostKeyAlgorithms=+ssh-rsa",
  "-o", "PubkeyAcceptedAlgorithms=+ssh-rsa",
  "-o", "StrictHostKeyChecking=no"
]
```

## CLI 用法

生成 YAML 并上传：

```bash
node updater.js --config config.json
```

查看命令帮助：

```bash
npm run help
```

只生成 YAML：

```bash
node updater.js --config config.json --convert-only
```

上传已有 YAML，不重新转换订阅：

```bash
node updater.js --config config.json --upload-only --local-yaml ./out/clash.yaml
```

上传 `out/` 目录里按文件名排序的第一个 `.yaml/.yml`：

```bash
node updater.js --config config.json --upload-only
```

上传并测试配置，但不重启 ShellCrash：

```bash
node updater.js --config config.json --no-restart
```

## Web 用法

```bash
npm start
```

页面功能：

- 修改订阅地址和路由器配置
- 仅生成 YAML
- 下载 YAML
- 生成并上传
- 选择本地 YAML 文件并上传

“上传 YAML”的规则：

- 已选择文件：上传所选 `.yaml/.yml`
- 未选择文件：上传 `out/` 中按文件名排序的第一个 `.yaml/.yml`

换端口：

```bash
PORT=3001 npm start
```

查看 Web 启动帮助：

```bash
npm run web:help
```

## Windows 说明

Windows 第一次运行时，需要手动下载并解压官方 subconverter：

```text
https://github.com/tindy2013/subconverter/releases/download/v0.9.0/subconverter_win64.7z
```

解压到：

```text
tools/subconverter/v0.9.0/win32-x64/subconverter/
```

确保存在：

```text
tools/subconverter/v0.9.0/win32-x64/subconverter/subconverter.exe
```

## 安全提醒

不要提交这些文件或目录：

- `config.json`
- `known_hosts`
- SSH 私钥，例如 `id_rsa`
- `out/`
- `uploads/`
- `tools/`

订阅转换后的 YAML 通常包含真实代理节点，也应视为敏感文件。

`known_hosts` 不是订阅内容，但它属于本地 SSH 状态文件，只对当前使用者和当前设备有意义。

## 发布前检查

准备上传 GitHub 前，至少检查这几项：

- `config.json` 没有被提交
- `out/`、`uploads/`、`tools/` 没有被提交
- README 中的仓库地址已经替换成你的真实 GitHub 地址
- `config.example.json` 里没有你的真实订阅地址或私钥路径
- 本地运行一次 `npm run check`

建议同时更新：

- `package.json` 中的版本号
- `CHANGELOG.md`

## License

MIT
