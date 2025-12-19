"use strict";

class WizardSystem {
  constructor() {
    this.wizardData = null;
    this.currentStep = null;
    this.wizardState = {};
    this.flasher = null;
    
    this.agreementScreen = document.getElementById('agreementScreen');
    this.startScreen = document.getElementById('startScreen');
    this.wizardContainer = document.getElementById('wizardContainer');
    this.advancedContainer = document.getElementById('advancedContainer');
    this.wizardSteps = document.getElementById('wizardSteps');
    this.progressBar = document.getElementById('wizardProgress');
    this.progressSteps = document.getElementById('progressSteps');
    
    this.init();
  }

  async init() {
    try {
      await this.loadWizardData();
      this.setupEventListeners();
      this.hideAllContainers();
      await this.showAgreementModal();
    } catch (error) {
      console.error('Failed to initialize wizard:', error);
    }
  }

  async showAgreementModal() {
    const agreementContent = document.getElementById('agreementContent');
    const licenseText = document.getElementById('licenseText');
    const scrollProgress = document.getElementById('scrollProgress');
    const agreeBtn = document.getElementById('agreeBtn');
    const disagreeBtn = document.getElementById('disagreeBtn');
    
    this.showScreen('agreementScreen');
    
    try {
      let markdown;
      if (window.cacheManager) {
        const response = await fetch('./assets/license.md');
        markdown = await response.text();
      } else {
        const response = await fetch('./assets/license.md');
        if (response.ok) {
          markdown = await response.text();
        } else {
          throw new Error('Failed to load license');
        }
      }
      
      const htmlContent = this.markdownToHtml(markdown);
      licenseText.innerHTML = htmlContent;
    } catch (error) {
      console.error('Error loading license:', error);
      licenseText.textContent = 'Error loading agreement. Please try again.';
    }
    
    const checkScroll = () => {
      if (!agreementContent) return;
      
      const scrollTop = agreementContent.scrollTop;
      const scrollHeight = agreementContent.scrollHeight;
      const clientHeight = agreementContent.clientHeight;
      const scrollPercent = (scrollTop / (scrollHeight - clientHeight)) * 100;
      
      if (scrollProgress) {
        scrollProgress.style.width = scrollPercent + '%';
        scrollProgress.setAttribute('aria-valuenow', scrollPercent);
      }
      
      // Enable agree button when scrolled to bottom (within 5px tolerance)
      if (scrollTop + clientHeight >= scrollHeight - 5) {
        if (agreeBtn) {
          agreeBtn.disabled = false;
        }
      }
    };
    
    if (agreementContent) {
      agreementContent.addEventListener('scroll', checkScroll);
      // Initial check in case content is too short to scroll
      setTimeout(checkScroll, 100);
    }
    
    agreeBtn?.addEventListener('click', () => {
      this.showStartScreen();
    }, { once: true });
    
    disagreeBtn?.addEventListener('click', () => {
      // Try multiple methods to close the window
      window.close();
      
      // If window.close() doesn't work (most browsers block this), redirect
      setTimeout(() => {
        window.location.href = 'about:blank';
      }, 100);
    }, { once: true });
  }

  async loadWizardData() {
    try {
      if (window.cacheManager) {
        this.wizardData = await window.cacheManager.fetchWithCache('./assets/wizard.json', 'json');
      } else {
        const response = await fetch('./assets/wizard.json');
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        this.wizardData = await response.json();
      }
      console.log('Wizard data loaded:', this.wizardData);
    } catch (error) {
      console.error('Error loading wizard data:', error);
      throw error;
    }
  }

  markdownToHtml(markdown) {
    let html = markdown
      // Headers
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 class="h4 fw-bold mt-4 mb-3">$1</h1>')
      // Bold
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      // Code blocks
      .replace(/```([\s\S]*?)```/g, '<pre class="bg-light p-3 rounded"><code>$1</code></pre>')
      // Links
      .replace(/\[([^\]]+)\]\(([^\)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
      // Line breaks
      .replace(/\n\n/g, '</p><p class="mb-3">');
    
    html = '<p class="mb-3">' + html + '</p>';
    
    return html;
  }

  setupEventListeners() {
    document.getElementById('guidedSetupBtn')?.addEventListener('click', () => {
      this.startGuidedSetup();
    });
    
    document.getElementById('advancedBtn')?.addEventListener('click', () => {
      this.startAdvancedMode();
    });

    document.getElementById('backToStartBtn')?.addEventListener('click', () => {
      this.showStartScreen();
    });
    
    document.getElementById('backToStartFromAdvanced')?.addEventListener('click', () => {
      this.showStartScreen();
    });
  }

  showStartScreen() {
    this.showScreen('startScreen');
  }

  startGuidedSetup() {
    this.showScreen('wizardContainer');
    this.initializeProgressBar();
    this.goToStep('hardware_check');
  }

  startAdvancedMode() {
    this.showScreen('advancedContainer');
  }

  hideAllContainers() {
    this.agreementScreen.classList.add('d-none');
    this.startScreen.classList.add('d-none');
    this.wizardContainer.classList.add('d-none');
    this.advancedContainer.classList.add('d-none');
  }

  showScreen(screenId) {
    this.hideAllContainers();
    const screen = document.getElementById(screenId);
    if (screen) {
      screen.classList.remove('d-none');
    }
  }

  initializeProgressBar() {
    const mainSteps = [
      { id: 'hardware', label: 'Hardware', steps: ['hardware_check', 'programmer_detected', 'modern_programmer', 'legacy_programmer'] },
      { id: 'connection', label: 'Connection', steps: ['device_connection', 'device_detected'] },
      { id: 'flashing', label: 'Flashing', steps: ['firmware_selection', 'flash_stable', 'flash_beta', 'flash_legacy', 'flash_complete'] }
    ];

    this.progressSteps.innerHTML = '';
    mainSteps.forEach((step, index) => {
      const stepEl = document.createElement('div');
      stepEl.className = 'progress-step';
      stepEl.innerHTML = `
        <div class="step-number">${index + 1}</div>
        <div class="step-label">${step.label}</div>
      `;
      stepEl.dataset.stepId = step.id;
      stepEl.dataset.steps = JSON.stringify(step.steps);
      this.progressSteps.appendChild(stepEl);
    });
  }

  updateProgressBar(currentStepId) {
    const progressSteps = this.progressSteps.querySelectorAll('.progress-step');
    let activeIndex = -1;

    progressSteps.forEach((stepEl, index) => {
      const steps = JSON.parse(stepEl.dataset.steps);
      stepEl.classList.remove('active', 'completed');
      
      if (steps.includes(currentStepId)) {
        activeIndex = index;
        stepEl.classList.add('active');
      } else if (activeIndex > index || (activeIndex === -1 && index === 0)) {
        stepEl.classList.add('completed');
      }
    });

    const progressPercent = activeIndex >= 0 ? ((activeIndex + 1) / progressSteps.length) * 100 : 0;
    this.progressBar.style.width = `${progressPercent}%`;
  }

  async goToStep(stepId) {
    const step = this.wizardData.find(s => s.step === stepId);
    if (!step) {
      console.error('Step not found:', stepId);
      return;
    }

    this.currentStep = step;
    this.updateProgressBar(stepId);
    

    if (step.validator) {
      try {
        const validationResult = await this.runValidator(step.validator, step);
        if (validationResult !== undefined) {
          this.wizardState[step.validator] = validationResult;
        }
      } catch (error) {
        console.error('Validator error:', error);
      }
    }

    // Auto-advance if specified and conditions are met
    if (step.auto_advance && step.next_step) {
      const nextStep = this.determineNextStep(step);
      if (nextStep) {
        setTimeout(() => this.goToStep(nextStep), 1000);
        return;
      }
    }

    this.renderStep(step);
  }

  renderStep(step) {
    this.wizardSteps.innerHTML = '';
    
    console.log('Rendering step:', step);
    console.log('Step message:', step.message);
    
    const stepContainer = document.createElement('div');
    stepContainer.className = `wizard-step step-${step.step_type || 'default'}`;
    
    const icon = this.getStepIcon(step.step_type);
    
    let html = `
      <div class="step-header">
        <div class="step-icon">${icon}</div>
        <h2 class="step-title">${step.title || 'Untitled Step'}</h2>
      </div>
    `;
    
    if (step.message) {
      html += `
        <div class="wizard-message-content">
          <p class="step-message">${this.processMessage(step.message)}</p>
        </div>
      `;
    }
    
    if (step.help_message) {
      html += `
        <div class="step-help-section">
          <button class="btn btn-link btn-sm p-0" onclick="this.nextElementSibling.classList.toggle('d-none')">
            <i class="bi bi-question-circle me-1"></i>Need help?
          </button>
          <div class="alert alert-info mt-2 d-none">
            <small>${step.help_message}</small>
          </div>
        </div>
      `;
    }
    
    html += `
      <div class="step-actions">
        ${this.renderStepActions(step)}
      </div>
    `;
    
    stepContainer.innerHTML = html;
    this.wizardSteps.appendChild(stepContainer);
  }

  getStepIcon(stepType) {
    const icons = {
      'detection': '<i class="bi bi-search"></i>',
      'info': '<i class="bi bi-info-circle-fill"></i>',
      'warning': '<i class="bi bi-exclamation-triangle-fill"></i>',
      'error': '<i class="bi bi-x-circle-fill"></i>',
      'success': '<i class="bi bi-check-circle-fill"></i>',
      'action': '<i class="bi bi-gear-fill"></i>',
      'menu': '<i class="bi bi-list-ul"></i>'
    };
    return icons[stepType] || '<i class="bi bi-circle-fill"></i>';
  }

  processMessage(message) {

    return message
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  renderStepActions(step) {
    let actions = '';

    if (step.step_type === 'menu' && step.options) {
  
      const primaryOption = step.options.find(opt => 
        opt.label.toLowerCase().includes('try') && 
        (opt.label.toLowerCase().includes('again') || opt.label.toLowerCase().includes('detection'))
      );
      const troubleshootingOptions = step.options.filter(opt => opt !== primaryOption);
      
      if (troubleshootingOptions.length > 0) {
        actions += '<div class="wizard-option-list mb-4">';
        
        troubleshootingOptions.forEach((option, index) => {
          actions += `
            <div class="wizard-option-item" onclick="wizard.handleMenuOption('${option.next}', '${option.firmware || ''}')">
              <span class="option-number">${index + 1}</span>
              <span class="option-label">${option.label}</span>
              <i class="bi bi-chevron-right option-arrow"></i>
            </div>
          `;
        });
        
        actions += '</div>';
      }
      
      if (primaryOption) {
        actions += `
          <button class="btn btn-primary btn-lg w-100 fw-bold" onclick="wizard.handleMenuOption('${primaryOption.next}', '${primaryOption.firmware || ''}')">
            <i class="bi bi-arrow-clockwise me-2"></i>${primaryOption.label}
          </button>
        `;
      }
    } else if (step.step_type === 'action') {
      actions += `
        <button class="btn btn-success btn-lg" id="wizardActionBtn" onclick="wizard.handleAction('${step.action}', '${step.firmware || ''}')">
          <span class="spinner-border spinner-border-sm d-none me-2"></span>
          Start ${step.title}
        </button>
      `;
      if (step.action === 'flash_firmware') {
        actions += `
          <div id="wizardFlashProgress" class="mt-3 w-100" style="display: none;">
            <div class="d-flex justify-content-between mb-1">
              <span id="wizardFlashLabel" class="small fw-bold">Flashing...</span>
              <span id="wizardFlashPercent" class="small">0%</span>
            </div>
            <div class="progress" style="height: 20px;">
              <div id="wizardFlashBar" class="progress-bar progress-bar-striped progress-bar-animated" role="progressbar" style="width: 0%; background-color: #c41e3a;" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100"></div>
            </div>
          </div>
        `;
      }
    } else if (step.next_step) {
      const nextSteps = Array.isArray(step.next_step) ? step.next_step : [{ step: step.next_step, label: 'Continue' }];
      
      nextSteps.forEach(next => {
        if (!next.condition || this.checkCondition(next.condition)) {
          actions += `
            <button class="btn btn-primary btn-lg me-2" onclick="wizard.goToStep('${next.step}')">
              ${next.label || 'Continue'}
            </button>
          `;
        }
      });
    }

    if (step.external_link) {
      actions += `
        <a href="${step.external_link}" target="_blank" class="btn btn-outline-primary btn-lg me-2">
          <i class="fas fa-external-link-alt"></i> Visit Link
        </a>
      `;
    }

    return actions;
  }

  handleMenuOption(nextStep, firmware = '') {
    if (firmware) {
      this.wizardState.selectedFirmware = firmware;
    }
    this.goToStep(nextStep);
  }

  async handleAction(action, firmware = '') {
    const button = event.target;
    const spinner = button.querySelector('.spinner-border');
    
    button.disabled = true;
    spinner?.classList.remove('d-none');

    try {
      switch (action) {
        case 'select_port':
          await this.selectPort();
          break;
        case 'connect_device':
          await this.connectDevice();
          break;
        case 'flash_firmware':
          await this.flashFirmware(firmware || this.wizardState.selectedFirmware);
          break;
        default:
          console.warn('Unknown action:', action);
      }
      
      const nextStep = this.determineNextStep(this.currentStep);
      if (nextStep) {
        this.goToStep(nextStep);
      }
    } catch (error) {
      console.error('Action failed:', error);
    } finally {
      button.disabled = false;
      spinner?.classList.add('d-none');
    }
  }

  async selectPort() {
    try {
      window.ErrorHandler?.logInfo('Requesting serial port selection...');
      const port = await navigator.serial.requestPort();
      this.wizardState.selectedPort = port;
      window.ErrorHandler?.logInfo('Serial port selected successfully');
    } catch (error) {
      console.error('Port selection failed:', error);
      window.ErrorHandler?.logError('Port selection cancelled or failed');
      throw error;
    }
  }

  async connectDevice() {
    try {
      const terminal = window.terminal;
      const ErrorHandler = window.ErrorHandler;
      
      ErrorHandler.logInfo('Connecting to device...');
      
      const flashMap = window.getFlashMap();
      if (!flashMap) {
        ErrorHandler.logInfo('Loading memory map...');
        await window.loadMemoryMap();
      }
      
      const selectedBranch = window.selectedBranch;
      const baseUrl = window.baseUrl;
      const branchName = selectedBranch.includes('branch-') ? selectedBranch.split('-')[1] : selectedBranch;
      const fullBaseUrl = `${baseUrl}/${branchName}/firmware`;
      
      const ESPFlasher = window.ESPFlasher;
      const flasher = new ESPFlasher(terminal, window.getFlashMap(), fullBaseUrl);
      window.setFlasher(flasher);
      
      const preSelectedPort = this.wizardState.selectedPort;
      await flasher.connect(preSelectedPort);
      
      if (this.wizardState.programmer_version === 2) {
        ErrorHandler.logInfo('Using modern programmer (v2) - visual indicators on programmer show device status');
      } else {
        ErrorHandler.logInfo('Using legacy programmer (v1)');
      }
      
      try {
        const size = await flasher.getFlashSize();
        if (size === '1024' || size === '2048') {
          window.setDetectedFlashSize(size);
        } else {
          window.setDetectedFlashSize('1024');
        }
        ErrorHandler.logInfo(`Detected ${window.getDetectedFlashSize()}KB flash size and will use it for flashing`);
      } catch (error) {
        window.setDetectedFlashSize('1024');
        ErrorHandler.logWarning('Flash size detection failed, defaulting to 1024KB (1MB)');
      }
      
      this.wizardState.device_connected = true;
    } catch (error) {
      console.error('Connection error:', error);
      throw error;
    }
  }

  async flashFirmware(firmware) {

    const flasher = window.getFlasher();
    if (flasher) {
      const firmwareBuildSelect = document.getElementById('firmwareBuild');
      if (firmwareBuildSelect) {
        firmwareBuildSelect.value = firmware;
      }
      
      const progressContainer = document.getElementById('wizardFlashProgress');
      const progressBar = document.getElementById('wizardFlashBar');
      const progressLabel = document.getElementById('wizardFlashLabel');
      const progressPercent = document.getElementById('wizardFlashPercent');
      const actionBtn = document.getElementById('wizardActionBtn');
      
      if (progressContainer) {
        progressContainer.style.display = 'block';
      }
      
      const onProgress = (progress) => {
        if (progressBar) {
          progressBar.style.width = `${progress.percent}%`;
          progressBar.setAttribute('aria-valuenow', progress.percent.toString());
        }
        if (progressPercent) {
          progressPercent.textContent = `${progress.percent}%`;
        }
        if (progressLabel) {
          if (progress.phase === 'loading') {
            progressLabel.textContent = 'Loading firmware files...';
          } else if (progress.phase === 'patching') {
            progressLabel.textContent = 'Patching firmware...';
          } else if (progress.phase === 'flashing') {
            progressLabel.textContent = progress.message || 'Writing to device...';
          } else if (progress.phase === 'complete') {
            progressLabel.textContent = 'Flash complete!';
            if (progressBar) progressBar.classList.remove('progress-bar-animated');
          }
        }
        if (actionBtn) {
          if (progress.phase === 'loading') {
            actionBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Loading...';
          } else if (progress.phase === 'patching') {
            actionBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Patching...';
          } else if (progress.phase === 'flashing') {
            actionBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Flashing ${progress.percent}%`;
          } else if (progress.phase === 'complete') {
            actionBtn.innerHTML = '<i class="bi bi-check-circle me-2"></i>Complete!';
          }
        }
      };
      
      let wifiConfig;
      const customizeWifi = document.getElementById('customizeWifi');
      if (customizeWifi?.checked) {
        const ssid = document.getElementById('ssidName')?.value || 'O.MG';
        const password = document.getElementById('wifiPassword')?.value || '12345678';
        const wifiModeEl = document.querySelector('input[name="wifiMode"]:checked');
        const wifiModeValue = wifiModeEl?.value || 'ap';
        wifiConfig = {
          ssid,
          password,
          mode: wifiModeValue === 'station' ? 'station' : 'ap'
        };
      }
      
      const flashSize = window.getDetectedFlashSize();
      window.ErrorHandler.logInfo(`Starting flash process with ${flashSize}KB flash size (auto-detected)`);
      await flasher.flash(flashSize, wifiConfig, onProgress);
      
      window.ErrorHandler.logInfo('Flash completed successfully!');
    } else {
      throw new Error('Flasher not available');
    }
  }

  determineNextStep(step) {
    if (!step.next_step) return null;
    
    if (typeof step.next_step === 'string') {
      return step.next_step;
    }
    
    if (Array.isArray(step.next_step)) {
      for (const next of step.next_step) {
        if (!next.condition || this.checkCondition(next.condition)) {
          return next.step;
        }
      }
    }
    
    return null;
  }

  checkCondition(condition) {
    switch (condition) {
      case 'programmer_found':
        return this.wizardState.programmer_detected === true;
      case 'no_programmer':
        return this.wizardState.programmer_detected === false;
      case 'modern_programmer':
        return this.wizardState.programmer_type === 'modern';
      case 'legacy_programmer':
        return this.wizardState.programmer_type === 'legacy';
      case 'device_connected':
        return this.wizardState.device_connected === true;
      case 'device_not_connected':
        return this.wizardState.device_connected === false;
      default:
        return true;
    }
  }

  async runValidator(validatorName, step) {
    switch (validatorName) {
      case 'checkHardwareConnection':
        return await this.checkHardwareConnection();
      case 'detectProgrammerType':
        return await this.detectProgrammerType();
      default:
        console.warn('Unknown validator:', validatorName);
        return true;
    }
  }

  async checkHardwareConnection() {
    try {
      if (!navigator.serial) {
        this.wizardState.programmer_detected = false;
        return false;
      }
      
      const ports = await navigator.serial.getPorts();
      this.wizardState.programmer_detected = ports.length > 0;
      return ports.length > 0;
    } catch (error) {
      console.error('Hardware check failed:', error);
      this.wizardState.programmer_detected = false;
      return false;
    }
  }

  async detectProgrammerType() {
    try {
      const port = this.wizardState.selectedPort;
      if (!port) {
        throw new Error('No port selected - please select a port first');
      }
      
      await port.open({ baudRate: 115200 });
      
      let programmerVersion = 1; // Default to legacy
      
      try {
        await port.setSignals({ dataTerminalReady: false });
        await new Promise(resolve => setTimeout(resolve, 50));
        
        let signals = await port.getSignals();
        let allChecksPassed = true;
        const checkValues = [true, false, true];
        
        for (const dtrValue of checkValues) {
          await port.setSignals({ dataTerminalReady: dtrValue });
          await new Promise(resolve => setTimeout(resolve, 50));
          
          signals = await port.getSignals();
          const dsrValue = signals.dataSetReady;
          if (dsrValue !== dtrValue) {
            allChecksPassed = false;
            break;
          }
        }
        
        if (allChecksPassed) {
          programmerVersion = 2;
          console.log('Found programmer version: 2 (modern)');
          window.ErrorHandler?.logInfo('Detected modern programmer (v2) - no reconnection required');
        } else {
          console.log('Found programmer version: 1 (legacy)');
          window.ErrorHandler?.logInfo('Detected legacy programmer (v1)');
        }
      } catch (signalError) {
        console.warn('Signal detection failed, defaulting to version 1:', signalError);
        window.ErrorHandler?.logWarning('Signal detection failed, assuming legacy programmer');
      }
      
      try {
        await port.close();
      } catch (e) {
        // Ignore close errors
      }
      
      // Store result in wizard state
      this.wizardState.programmer_version = programmerVersion;
      this.wizardState.programmer_type = programmerVersion === 2 ? 'modern' : 'legacy';
      
      return this.wizardState.programmer_type;
    } catch (error) {
      console.error('Programmer detection failed:', error);
      window.ErrorHandler?.logWarning('Programmer detection cancelled or failed');
      this.wizardState.programmer_version = 1;
      this.wizardState.programmer_type = 'legacy';
      return 'legacy';
    }
  }
}

// Initialize wizard system
let wizard;
document.addEventListener('DOMContentLoaded', () => {
  wizard = new WizardSystem();
  // Make wizard globally available for inline onclick handlers
  window.wizard = wizard;
});
