/**
 * wps-native-ai.js — 原生 WPS AI / 稻壳 启用状态的只读指示器
 *
 * Kaiwu 加载项运行在 WPS CEF 沙盒中,无法读取 HKCU 注册表,故状态为静态
 * (永远返回 'unsupported');真实状态需运行 verify.bat 或 reg query 确认.
 *
 * 用法:
 *   WPSNativeAIStatus.getStatus();       // { disabled: null, source: 'unsupported', hint: '...' }
 *   WPSNativeAIStatus.getRegistryKeys(); // [ {key, value, desc}, ... ]
 *   WPSNativeAIStatus.isFeatureAvailable(); // true
 */
(function () {
  if (typeof window === 'undefined') return;

  var REGISTRY_KEYS = [
    { key: 'CloudService', value: 0, desc: 'WPS 云服务 (含 AI 助手入口)' },
    { key: 'EnableAI', value: 0, desc: '原生 AI 助手启用开关' },
    { key: 'DocerEnabled', value: 0, desc: '稻壳 (Docer) 模板/插件入口' },
  ];

  var HINT =
    '请运行包内的 disable-wps-native-ai.bat 或 enable-wps-native-ai.bat 切换原生 WPS AI / 稻壳 的可见性。重启 WPS 后生效。';

  var WPSNativeAIStatus = {
    getStatus: function () {
      return {
        disabled: null,
        source: 'unsupported',
        hint: HINT,
      };
    },
    getRegistryKeys: function () {
      return REGISTRY_KEYS.map(function (e) {
        return { key: e.key, value: e.value, desc: e.desc };
      });
    },
    isFeatureAvailable: function () {
      return true;
    },
  };

  window.WPSNativeAIStatus = WPSNativeAIStatus;
})();
