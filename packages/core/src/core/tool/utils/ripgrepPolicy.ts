/**
 * Ripgrep 下载策略开关
 *
 * 说明：
 * - 当前阶段先用 core 内部常量控制“是否允许自动下载 ripgrep 二进制文件”
 * - 未来应由 CLI 层读取配置文件/环境变量/参数后注入到 core（避免 core 直接做配置 IO）
 */

/**
 * 是否允许在系统 PATH 不存在 rg 时，自动下载 ripgrep 到用户级 binDir。
 */
export const RIPGREP_AUTO_DOWNLOAD_ENABLED = true;

