/* Only a user click grants access to this tab. No host, cookie or storage permission. */
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !/^https?:\/\//i.test(tab.url || "")) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      files: ["core.js", "panel-adapter.js", "vendor/canvas-confetti.js", "celebration.js", "content.js"],
    });
    await chrome.action.setBadgeText({ tabId: tab.id, text: "" });
    await chrome.action.setTitle({ tabId: tab.id, title: "KK塔传 · 在当前宝塔页面上传文件" });
  } catch {
    await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#ad401e" });
    await chrome.action.setBadgeText({ tabId: tab.id, text: "!" });
    await chrome.action.setTitle({ tabId: tab.id, title: "无法打开KK塔传。请刷新宝塔文件页面后重试。" });
  }
});
