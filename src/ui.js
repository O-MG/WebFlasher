function toggleStep(stepId) {
    const step = document.getElementById(stepId);
    if (step && step.classList.contains('completed')) {
        step.classList.toggle('active');
    }
}

function setStepCompleted(stepId) {
    const step = document.getElementById(stepId);
    if (step) {
        step.classList.remove('active');
        step.classList.add('completed');
    }
}

function setStepActive(stepId) {
    const step = document.getElementById(stepId);
    if (step) {
        step.classList.add('active');
        step.classList.remove('completed');
    }
}

// Make functions globally available for inline onclick handlers
window.toggleStep = toggleStep;
window.setStepCompleted = setStepCompleted;
window.setStepActive = setStepActive;

const agreeBtn = document.getElementById('agreeBtn');
if (agreeBtn) {
    agreeBtn.addEventListener('click', () => {
        localStorage.setItem('agreementAccepted', 'true');
    });
}

const disagreeBtn = document.getElementById('disagreeBtn');
if (disagreeBtn) {
    disagreeBtn.addEventListener('click', () => {
        window.location.href = 'https://o.mg.lol';
    });
}

document.getElementById('uploadCustomBinary')?.addEventListener('change', (e) => {
    const target = e.target;
    document.getElementById('customBinarySection').style.display = target.checked ? 'block' : 'none';
});

document.getElementById('customizeWifi')?.addEventListener('change', (e) => {
    const target = e.target;
    document.getElementById('wifiConfigSection').style.display = target.checked ? 'block' : 'none';
});

document.getElementById('saveSettings')?.addEventListener('click', () => {
    const settings = {
        customizeWifi: document.getElementById('customizeWifi').checked,
        wifiMode: document.querySelector('input[name="wifiMode"]:checked')?.value,
        ssidName: document.getElementById('ssidName').value,
        wifiPassword: document.getElementById('wifiPassword').value,
        uploadCustomBinary: document.getElementById('uploadCustomBinary').checked
    };
    localStorage.setItem('omgFlasherSettings', JSON.stringify(settings));
    bootstrap.Modal.getInstance(document.getElementById('settingsModal')).hide();
    showAlert('Settings saved successfully!', 'success');
});

function loadSettings() {
    const savedSettings = localStorage.getItem('omgFlasherSettings');
    if (savedSettings) {
        try {
            const settings = JSON.parse(savedSettings);
            if (settings.customizeWifi) {
                document.getElementById('customizeWifi').checked = true;
                document.getElementById('wifiConfigSection').style.display = 'block';
            }
            if (settings.wifiMode) {
                const modeRadio = document.querySelector(`input[name="wifiMode"][value="${settings.wifiMode}"]`);
                if (modeRadio) modeRadio.checked = true;
            }
            if (settings.ssidName) {
                document.getElementById('ssidName').value = settings.ssidName;
            }
            if (settings.wifiPassword) {
                document.getElementById('wifiPassword').value = settings.wifiPassword;
            }
            if (settings.uploadCustomBinary) {
                document.getElementById('uploadCustomBinary').checked = true;
                document.getElementById('customBinarySection').style.display = 'block';
            }
        } catch (e) {
            console.error('Failed to load settings:', e);
        }
    }
}

loadSettings();

function getWifiConfig() {
    const savedSettings = localStorage.getItem('omgFlasherSettings');
    if (savedSettings) {
        try {
            const settings = JSON.parse(savedSettings);
            if (settings.customizeWifi) {
                return {
                    ssid: settings.ssidName || 'O.MG',
                    password: settings.wifiPassword || '12345678',
                    mode: settings.wifiMode === 'existing' ? 'station' : 'ap'
                };
            }
        } catch (e) {
            console.error('Failed to load WiFi settings:', e);
        }
    }
    return {
        ssid: 'O.MG',
        password: '12345678',
        mode: 'ap'
    };
}

window.getWifiConfig = getWifiConfig;

document.getElementById('clearConsole')?.addEventListener('click', () => {
    document.getElementById('consoleTerminal').innerHTML = '';
});

document.getElementById('downloadLogs')?.addEventListener('click', () => {
    const logs = document.getElementById('consoleTerminal').textContent;
    const blob = new Blob([logs], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `omg-flasher-logs-${new Date().toISOString()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
});

function showAlert(message, type = 'info') {
    const alertArea = document.getElementById('alertArea');
    const alert = document.createElement('div');
    alert.className = `alert alert-${type} alert-dismissible fade show`;
    alert.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    alertArea.appendChild(alert);
    setTimeout(() => alert.remove(), 5000);
}

document.getElementById('step2HelpBtn')?.addEventListener('click', () => {
    showAlert('Troubleshooting Tips:<br>1. Make sure your USB cable supports data transfer<br>2. Try a different USB port<br>3. Check if drivers are installed for your device<br>4. On Windows, you may need CH340 or CP2102 drivers<br>5. Try unplugging and replugging the device', 'info');
});

document.getElementById('step3HelpBtn')?.addEventListener('click', () => {
    showAlert('Make sure your device stays connected during the flashing process. Do not unplug or disconnect until complete.', 'info');
});
