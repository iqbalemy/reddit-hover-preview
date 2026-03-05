const SETTINGS_KEY = "hoverPreviewEnabled";

document.addEventListener("DOMContentLoaded", () => {
	const toggle = document.getElementById("toggle");
	const status = document.getElementById("status");
	if (!toggle || !status) {
		return;
	}

	chrome.storage.sync.get({ [SETTINGS_KEY]: true }, (result) => {
		const isEnabled = Boolean(result[SETTINGS_KEY]);
		toggle.checked = isEnabled;
		status.textContent = isEnabled ? "Preview is enabled" : "Preview is disabled";
	});

	toggle.addEventListener("change", () => {
		const isEnabled = toggle.checked;
		chrome.storage.sync.set({ [SETTINGS_KEY]: isEnabled }, () => {
			status.textContent = isEnabled ? "Preview is enabled" : "Preview is disabled";
		});
	});
});
