class RepeaterSetup {
    constructor() {
        this.port = null;
        this.reader = null;
        this.writer = null;
        this.readBuffer = '';
        this.map = null;
        this.marker = null;
        this.presets = [];
        this.nodeType = null;
        this.lastCommand = '';
        this.waitingForACL = false;
        this.aclEntries = [];
        this.repeatMode = null;
        this.pendingFactoryReset = false;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadPresets();
        this.setupPasswordToggles();
        
        // Disable all buttons and inputs on page load (not connected yet)
        this.setButtonsEnabled(false);
    }

    setupEventListeners() {
        document.getElementById('connectBtn').addEventListener('click', () => this.toggleConnection());
        document.getElementById('btnToggleConsole').addEventListener('click', () => this.toggleConsole());
        document.getElementById('btnClearConsole').addEventListener('click', () => this.clearConsole());
        document.getElementById('btnSendManual').addEventListener('click', () => this.sendManualCommand());
        document.getElementById('manualCommand').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendManualCommand();
        });
        document.getElementById('btnReloadInfo').addEventListener('click', () => this.loadRepeaterInfo());
        document.getElementById('btnFloodAdvert').addEventListener('click', () => this.sendCommand('advert'));
        document.getElementById('btnEnableRepeat').addEventListener('click', () => this.toggleRepeatMode());
        document.getElementById('btnStartOTA').addEventListener('click', () => this.sendCommand('start ota'));
        document.getElementById('btnReboot').addEventListener('click', () => this.confirmAndExecute('Reboot the repeater?', 'reboot'));
        document.getElementById('btnFactoryReset').addEventListener('click', () => this.factoryReset());
        document.getElementById('btnSaveSettings').addEventListener('click', () => this.saveSettings());
        document.getElementById('btnLoadSettings').addEventListener('click', () => this.loadSettings());
        document.getElementById('btnShowMap').addEventListener('click', () => this.showMap());
        document.getElementById('btnCloseMap').addEventListener('click', () => this.hideMap());
        document.getElementById('btnAutoChoose').addEventListener('click', () => this.autoChooseId());
        document.getElementById('btnChooseFromTable').addEventListener('click', () => this.showCollisionHelperModal());
        document.getElementById('btnGenerate').addEventListener('click', () => this.generateKeys());
        document.getElementById('btnSaveSetKey').addEventListener('click', () => this.setPrivateKey());
        
        // Clear compliance status when private key is manually modified
        document.getElementById('privateKey').addEventListener('input', () => this.clearComplianceStatus());
        
        // Validate desired ID input for invalid values (00, FF)
        document.getElementById('desiredId').addEventListener('input', (e) => this.validateDesiredId(e.target.value));
        document.getElementById('desiredId').addEventListener('blur', (e) => this.validateDesiredId(e.target.value));
        document.getElementById('btnSetACL').addEventListener('click', () => this.setACL());
        document.getElementById('btnApplyRadio').addEventListener('click', () => this.applyRadioSettings());
        document.getElementById('preset').addEventListener('change', (e) => this.applyPreset(e.target.value));
        document.getElementById('btnApplyNameLocation').addEventListener('click', () => this.applyNameLocation());
        document.getElementById('btnSetPasswords').addEventListener('click', () => this.setPasswords());
        
        const inputs = ['frequency', 'bandwidth', 'spreadingFactor', 'codingRate', 'txPower', 'airtimeFactor'];
        inputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', () => this.validateRadioSettings());
            }
        });
    }

    toggleConsole() {
        const container = document.getElementById('consoleContainer');
        const btn = document.getElementById('btnToggleConsole');
        if (container.style.display === 'none') {
            container.style.display = 'block';
            btn.textContent = 'Hide Console';
        } else {
            container.style.display = 'none';
            btn.textContent = 'Show Console';
        }
    }

    clearConsole() {
        document.getElementById('console').innerHTML = '';
    }

    sendManualCommand() {
        const input = document.getElementById('manualCommand');
        const command = input.value;
        if (command) {
            this.sendCommand(command);
            input.value = '';
        }
    }

    logToConsole(message, type = 'info') {
        const consoleEl = document.getElementById('console');
        if (!consoleEl) return;
        
        const line = document.createElement('div');
        line.className = `console-line console-${type}`;
        const timestamp = new Date().toLocaleTimeString('hu-HU');
        line.textContent = `[${timestamp}] ${message}`;
        consoleEl.appendChild(line);
        consoleEl.scrollTop = consoleEl.scrollHeight;
    }

    setupPasswordToggles() {
        document.querySelectorAll('.btn-eye').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetId = e.target.dataset.target;
                const input = document.getElementById(targetId);
                if (input.type === 'password') {
                    input.type = 'text';
                } else {
                    input.type = 'password';
                }
            });
        });
    }

    async toggleConnection() {
        const btnText = document.getElementById('connectBtn').textContent;
        
        if (btnText === 'Disconnect') {
            await this.disconnect();
        } else if (btnText === 'Reconnect') {
            await this.reconnect();
        } else {
            await this.connect();
        }
    }

    async reconnect() {
        try {
            if (!this.port) {
                // Port was fully closed, need to request again
                await this.connect();
                return;
            }
            
            this.logToConsole('Reconnecting to serial port...', 'info');
            
            try {
                await this.port.open({ baudRate: 115200 });
            } catch (error) {
                // Port might already be open or invalid, request new one
                this.port = null;
                await this.connect();
                return;
            }

            const decoder = new TextDecoderStream();
            const inputDone = this.port.readable.pipeTo(decoder.writable);
            const inputStream = decoder.readable;

            this.reader = inputStream.getReader();
            this.writer = this.port.writable.getWriter();

            this.readLoop();

            const connectBtn = document.getElementById('connectBtn');
            connectBtn.textContent = 'Disconnect';
            connectBtn.className = 'btn-primary';
            document.getElementById('connectionStatus').textContent = 'Connected';
            document.getElementById('connectionStatus').className = 'status-connected';

            this.logToConsole('Reconnected successfully', 'info');
            
            await this.syncTime();
            await this.loadRepeaterInfo();

        } catch (error) {
            console.error('Reconnection error:', error);
            this.logToConsole(`Reconnection error: ${error.message}`, 'error');
            document.getElementById('loadingIndicator').style.display = 'none';
            this.setButtonsEnabled(false);
            alert('Failed to reconnect: ' + error.message);
        }
    }

    async connect() {
        try {
            this.logToConsole('Requesting serial port...', 'info');
            this.port = await navigator.serial.requestPort();
            this.logToConsole('Opening port at 115200 baud...', 'info');
            await this.port.open({ baudRate: 115200 });

            const decoder = new TextDecoderStream();
            const inputDone = this.port.readable.pipeTo(decoder.writable);
            const inputStream = decoder.readable;

            this.reader = inputStream.getReader();
            this.writer = this.port.writable.getWriter();

            this.readLoop();

            const connectBtn = document.getElementById('connectBtn');
            connectBtn.textContent = 'Disconnect';
            connectBtn.className = 'btn-primary';
            document.getElementById('connectionStatus').textContent = 'Connected';
            document.getElementById('connectionStatus').className = 'status-connected';

            this.logToConsole('Connected successfully', 'info');
            
            await this.syncTime();
            await this.loadRepeaterInfo();

        } catch (error) {
            console.error('Connection error:', error);
            this.logToConsole(`Connection error: ${error.message}`, 'error');
            document.getElementById('loadingIndicator').style.display = 'none';
            this.setButtonsEnabled(false);
            alert('Failed to connect: ' + error.message);
        }
    }

    async disconnect() {
        if (this.reader) {
            try {
                await this.reader.cancel();
            } catch (e) {}
            this.reader = null;
        }
        if (this.writer) {
            try {
                await this.writer.close();
            } catch (e) {}
            this.writer = null;
        }
        if (this.port) {
            try {
                await this.port.close();
            } catch (e) {}
            this.port = null;
        }

        this.nodeType = null;
        this.repeatMode = null;
        this.pendingFactoryReset = false;
        
        const connectBtn = document.getElementById('connectBtn');
        connectBtn.textContent = 'Connect Serial';
        connectBtn.className = 'btn-primary';
        document.getElementById('connectionStatus').textContent = 'Disconnected';
        document.getElementById('connectionStatus').className = 'status-disconnected';
        
        // Reset repeat mode button
        const btn = document.getElementById('btnEnableRepeat');
        btn.innerHTML = '<div>Enable Repeat</div><div class="repeat-status">(currently disabled)</div>';
        btn.classList.remove('btn-repeat-enabled');
        btn.classList.add('btn-repeat-disabled');
        
        // Hide loading indicator and disable buttons
        document.getElementById('loadingIndicator').style.display = 'none';
        this.setButtonsEnabled(false);
        
        this.logToConsole('Disconnected', 'info');
    }

    async readLoop() {
        try {
            while (true) {
                const { value, done } = await this.reader.read();
                if (done) break;
                
                this.readBuffer += value;
                this.processBuffer();
            }
        } catch (error) {
            console.error('Read error:', error);
            this.handleDisconnection();
        }
    }

    handleDisconnection() {
        this.logToConsole('Serial connection lost', 'error');
        
        // Clean up
        this.reader = null;
        this.writer = null;
        
        // Hide loading indicator and disable all buttons/inputs (read-only mode)
        document.getElementById('loadingIndicator').style.display = 'none';
        this.setButtonsEnabled(false);
        
        // Update UI to show reconnect option
        const connectBtn = document.getElementById('connectBtn');
        connectBtn.textContent = 'Reconnect';
        connectBtn.className = 'btn-reconnect';
        document.getElementById('connectionStatus').textContent = 'Disconnected';
        document.getElementById('connectionStatus').className = 'status-disconnected';
    }

    processBuffer() {
        const lines = this.readBuffer.split('\n');
        this.readBuffer = lines.pop();

        const showRaw = document.getElementById('showRawBytes')?.checked || false;

        lines.forEach(line => {
            const rawLine = line;
            line = line.trim();
            if (line) {
                if (showRaw) {
                    const bytes = Array.from(rawLine).map(c => {
                        const code = c.charCodeAt(0);
                        return code < 32 ? `[${code}]` : c;
                    }).join('');
                    this.logToConsole(`RX: ${line} | Raw: ${bytes}`, 'rx');
                } else {
                    this.logToConsole(`RX: ${line}`, 'rx');
                }
                this.parseResponse(line).catch(error => {
                    console.error('Error parsing response:', error);
                });
            }
        });
    }

    async parseResponse(line) {
        // Strip "-> " prefix from responses first
        if (line.startsWith('-> ')) {
            line = line.substring(3).trim();
        }
        
        // Skip if it's just an echo of our command (after prefix stripping)
        if (line.startsWith('get ') || line.startsWith('set ') || line.startsWith('ver') || line.startsWith('clock') || line.startsWith('board') || line.startsWith('time ') || line.startsWith('advert') || line.startsWith('start ') || line.startsWith('reboot') || line.startsWith('erase')) {
            return;
        }
        
        // Strip "> " prefix from values
        if (line.startsWith('> ')) {
            line = line.substring(2).trim();
        }
        
        // Parse ver command response - format: "v1.9.1-f5f5886 (Build: 02-Oct-2025)"
        if (this.lastCommand === 'ver' && (line.match(/^v\d+\.\d+/) || line.includes('Build'))) {
            document.getElementById('fwVersion').textContent = line;
            return;
        }
        
        // Parse "OK - clock set" confirmation
        if (line.includes('OK - clock set')) {
            const match = line.match(/(\d{2}:\d{2} - \d{2}\/\d{2}\/\d{4})/);
            if (match) {
                this.displayRepeaterTime(match[1]);
            }
            return;
        }
        
        // Parse clock command response - format: "08:11 - 13/10/2025 UTC"
        if (this.lastCommand === 'clock' && line.match(/^\d{2}:\d{2} - \d{2}\/\d{2}\/\d{4}/)) {
            this.displayRepeaterTime(line);
            return;
        }
        
        // Parse simple text responses based on last command
        if (line && !line.includes(':')) {
            const prevCommand = this.lastCommand;
            if (prevCommand === 'get name') {
                document.getElementById('nodeName').value = line;
                return;
            }
            if (prevCommand === 'board') {
                document.getElementById('boardType').textContent = line;
                return;
            }
            if (prevCommand === 'get pub.key' && line.match(/^[0-9A-Fa-f]{64}$/)) {
                const repeaterId = line.substring(0, 2).toUpperCase();
                this.updateRepeaterIdDisplay(repeaterId);
                return;
            }
            if (prevCommand === 'get prv.key' && line.match(/^[0-9A-Fa-f]{128}$/)) {
                document.getElementById('privateKey').value = line;
                // Extract public key from MeshCore private key format
                try {
                    const privateKeyBytes = this.hexToUint8Array(line);
                    // MeshCore private key format: 32-byte private scalar + 32-byte SHA-512 second half
                    // We need to derive the actual public key from the private scalar
                    const privateScalar = privateKeyBytes.slice(0, 32);
                    
                    // Derive public key using noble-ed25519
                    await this.initializeNobleEd25519();
                    let scalarBigInt = 0n;
                    for (let i = 0; i < 32; i++) {
                        scalarBigInt += BigInt(privateScalar[i]) << BigInt(8 * i);
                    }
                    const publicKeyPoint = this.nobleEd25519.Point.BASE.multiply(scalarBigInt);
                    const publicKeyBytes = publicKeyPoint.toRawBytes ? publicKeyPoint.toRawBytes() : publicKeyPoint.toBytes();
                    const publicKeyHex = this.uint8ArrayToHex(publicKeyBytes);
                    
                    document.getElementById('generatedPublicKey').value = publicKeyHex;
                    
                    // Set repeater ID (first 2 chars) and check collision
                    const repeaterId = publicKeyHex.substring(0, 2).toUpperCase();
                    this.updateRepeaterIdDisplay(repeaterId);
                } catch (error) {
                    console.error('Failed to derive public key from private key:', error);
                }
                return;
            }
        }
        
        // Parse coordinate responses
        const latMatch = line.match(/^([-]?\d+\.\d+)$/);
        if (latMatch && this.lastCommand === 'get lat') {
            document.getElementById('latitude').value = parseFloat(latMatch[1]);
            return;
        }
        if (latMatch && this.lastCommand === 'get lon') {
            document.getElementById('longitude').value = parseFloat(latMatch[1]);
            return;
        }
        
        // Parse radio settings response - format: "freq,bw,sf,cr"
        if (this.lastCommand === 'get radio' && line.match(/^\d+\.\d+,\d+(\.\d+)?,\d+,\d+$/)) {
            const parts = line.split(',');
            if (parts.length === 4) {
                document.getElementById('frequency').value = parseFloat(parts[0]).toFixed(3);
                document.getElementById('bandwidth').value = parseFloat(parts[1]);
                document.getElementById('spreadingFactor').value = parts[2];
                document.getElementById('codingRate').value = parts[3];
                this.logToConsole(`Radio: ${parseFloat(parts[0]).toFixed(3)}MHz, BW${parts[1]}, SF${parts[2]}, CR${parts[3]}`, 'info');
            }
            return;
        }
        
        // Parse TX power response
        if (this.lastCommand === 'get tx' && line.match(/^\d+$/)) {
            document.getElementById('txPower').value = parseInt(line);
            this.logToConsole(`TX Power: ${line} dBm`, 'info');
            return;
        }
        
        // Parse airtime factor response
        if (this.lastCommand === 'get af' && line.match(/^\d+(\.\d+)?$/)) {
            document.getElementById('airtimeFactor').value = parseFloat(line);
            this.logToConsole(`Airtime Factor: ${line}`, 'info');
            return;
        }
        
        // Parse key:value format responses
        if (line.includes(':')) {
            const [key, value] = line.split(':').map(s => s.trim());
            
            switch(key.toLowerCase()) {
                case 'board':
                    document.getElementById('boardType').textContent = value;
                    break;
                case 'fw':
                case 'version':
                    document.getElementById('fwVersion').textContent = value;
                    break;
                case 'pub.key':
                case 'pubkey':
                    const repeaterId = value.substring(0, 2).toUpperCase();
                    this.updateRepeaterIdDisplay(repeaterId);
                    break;
                case 'type':
                    this.nodeType = parseInt(value);
                    this.checkNodeType();
                    break;
                case 'name':
                    document.getElementById('nodeName').value = value;
                    break;
                case 'lat':
                case 'latitude':
                    document.getElementById('latitude').value = parseFloat(value);
                    break;
                case 'lon':
                case 'longitude':
                    document.getElementById('longitude').value = parseFloat(value);
                    break;
                case 'freq':
                case 'frequency':
                    document.getElementById('frequency').value = parseFloat(value).toFixed(3);
                    break;
                case 'bw':
                case 'bandwidth':
                    document.getElementById('bandwidth').value = parseFloat(value);
                    break;
                case 'sf':
                    document.getElementById('spreadingFactor').value = value;
                    break;
                case 'cr':
                    document.getElementById('codingRate').value = value;
                    break;
                case 'pwr':
                case 'tx':
                    document.getElementById('txPower').value = value;
                    break;
                case 'af':
                    document.getElementById('airtimeFactor').value = parseFloat(value);
                    break;
                case 'repeat':
                    // Track repeat mode status
                    this.repeatMode = value.toLowerCase() === 'on' || value === '1';
                    this.updateRepeatModeButton();
                    this.logToConsole(`Repeat mode: ${value}`, 'info');
                    break;
            }
        }
        
        // Parse on/off responses for repeat command
        // Note: repeat being "off" doesn't mean it's not a repeater device,
        // just that repeater mode is disabled. We can still configure it.
        if ((line.toLowerCase() === 'on' || line.toLowerCase() === 'off') && this.lastCommand === 'get repeat') {
            this.repeatMode = line.toLowerCase() === 'on';
            this.updateRepeatModeButton();
            if (this.repeatMode) {
                this.logToConsole('Repeater mode: enabled', 'info');
            } else {
                this.logToConsole('Repeater mode: disabled (can be enabled with "set repeat on")', 'info');
            }
        }
        
        // Handle response from setting repeat mode
        if (this.lastCommand === 'set repeat on' || this.lastCommand === 'set repeat off') {
            // Query the new status
            setTimeout(() => this.sendCommand('get repeat'), 200);
        }
        
        // Parse ACL header - if next would be empty, we'll show "none"
        if (line === 'ACL:') {
            this.logToConsole('Checking ACL entries...', 'info');
            this.waitingForACL = true;
            this.aclEntries = [];
            return;
        }
        
        // Handle empty ACL
        if (this.waitingForACL && line === '') {
            this.waitingForACL = false;
            this.updateACLDisplay();
            if (this.aclEntries.length === 0) {
                this.logToConsole('ACL: none', 'info');
            } else {
                this.logToConsole(`ACL: ${this.aclEntries.length} entries`, 'info');
            }
            return;
        }
        
        // Handle ACL entries
        if (this.waitingForACL && line.length > 0) {
            this.aclEntries.push(line);
            return;
        }
        
        // Handle factory reset completion
        if (this.pendingFactoryReset && (line.includes('File system erase: OK') || line.includes('erase: OK'))) {
            this.logToConsole('✓ Factory reset complete, rebooting in 2 seconds...', 'info');
            this.pendingFactoryReset = false;
            setTimeout(async () => {
                await this.sendCommand('reboot');
            }, 2000);
            return;
        }
    }

    updateACLDisplay() {
        const aclDiv = document.getElementById('aclList');
        if (this.aclEntries.length === 0) {
            aclDiv.innerHTML = 'none';
        } else {
            // Show only public keys for easy copying
            aclDiv.innerHTML = this.aclEntries.map(entry => {
                // Extract just the public key part (first column before any space/tab)
                const pubkey = entry.split(/\s+/)[0];
                return `<div style="margin: 2px 0;">${pubkey}</div>`;
            }).join('');
        }
    }

    updateRepeatModeButton() {
        const btn = document.getElementById('btnEnableRepeat');
        
        if (this.repeatMode === true) {
            btn.innerHTML = '<div>Disable Repeat</div><div class="repeat-status">(currently enabled)</div>';
            btn.classList.remove('btn-repeat-disabled');
            btn.classList.add('btn-repeat-enabled');
        } else if (this.repeatMode === false) {
            btn.innerHTML = '<div>Enable Repeat</div><div class="repeat-status">(currently disabled)</div>';
            btn.classList.remove('btn-repeat-enabled');
            btn.classList.add('btn-repeat-disabled');
        }
    }

    async toggleRepeatMode() {
        if (this.repeatMode === true) {
            await this.sendCommand('set repeat off');
        } else {
            await this.sendCommand('set repeat on');
        }
    }

    async updateRepeaterIdDisplay(repeaterId) {
        const idElement = document.getElementById('repeaterId');
        const warningElement = document.getElementById('collisionWarning');
        idElement.textContent = repeaterId;
        
        // Set default color while checking
        idElement.style.color = '#fbbf24';
        idElement.title = 'Checking collision status...';
        warningElement.style.display = 'none';
        
        try {
            // Fetch collision data from map
            const occupiedIds = await this.fetchOccupiedIds();
            
            if (occupiedIds.has(repeaterId)) {
                const names = occupiedIds.get(repeaterId);
                if (names.length > 1) {
                    // Colliding - multiple repeaters
                    idElement.style.color = '#f87171';
                    idElement.title = `COLLISION: ${names.length} repeaters using this ID:\n${names.join('\n')}`;
                    warningElement.style.display = 'block';
                } else {
                    // Occupied - single repeater
                    idElement.style.color = '#f87171';
                    idElement.title = `Occupied by: ${names[0]}`;
                    warningElement.style.display = 'block';
                }
            } else {
                // Unoccupied - green
                idElement.style.color = '#4ade80';
                idElement.title = 'Unoccupied ID';
                warningElement.style.display = 'none';
            }
        } catch (error) {
            console.error('Failed to check collision:', error);
            idElement.style.color = '#888';
            idElement.title = `Could not verify collision status.\nError: ${error.message}\n\nClick "Show Console" to see details.`;
            warningElement.style.display = 'none';
        }
    }

    checkNodeType() {
        if (this.nodeType !== null && this.nodeType !== 2) {
            const typeNames = {
                1: 'Client/Chat',
                3: 'Room Server',
            };
            const typeName = typeNames[this.nodeType] || 'Unknown';
            alert(`Node type is NOT Repeater!\nWe can only control repeater example reliably only\n\nDetected type: ${typeName} (${this.nodeType})`);
        }
    }

    displayRepeaterTime(timeStr) {
        try {
            // Remove "UTC" suffix if present
            timeStr = timeStr.replace(/\s*UTC\s*$/, '').trim();
            
            // Parse format: "08:11 - 13/10/2025"
            const match = timeStr.match(/(\d{2}):(\d{2})\s*-\s*(\d{2})\/(\d{2})\/(\d{4})/);
            if (match) {
                const hour = parseInt(match[1]);
                const minute = parseInt(match[2]);
                const day = parseInt(match[3]);
                const month = parseInt(match[4]) - 1;
                const year = parseInt(match[5]);
                
                const date = new Date(year, month, day, hour, minute, 0);
                const options = {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                };
                const formatter = new Intl.DateTimeFormat('hu-HU', options);
                document.getElementById('clock').textContent = formatter.format(date);
            } else {
                document.getElementById('clock').textContent = timeStr;
            }
        } catch (error) {
            console.error('Error parsing repeater time:', error);
            document.getElementById('clock').textContent = timeStr;
        }
    }

    async sendCommand(command, lineEnding = '\r\n') {
        if (!this.writer) {
            alert('Not connected to repeater');
            return;
        }

        try {
            this.logToConsole(`TX: ${command}`, 'tx');
            this.lastCommand = command;
            const encoder = new TextEncoder();
            await this.writer.write(encoder.encode(command + lineEnding));
            return true;
        } catch (error) {
            this.logToConsole(`ERROR: ${error.message}`, 'error');
            
            // Check if it's a disconnection error
            if (error.message.includes('device has been lost') || error.message.includes('not open')) {
                this.handleDisconnection();
            } else {
                alert('Failed to send command: ' + error.message);
            }
            return false;
        }
    }

    async syncTime() {
        this.logToConsole("Syncing time with computer's clock...", 'info');
        const now = new Date();
        const epochSeconds = Math.floor(now.getTime() / 1000);
        await this.sendCommand(`time ${epochSeconds}`);
    }

    async loadRepeaterInfo() {
        this.logToConsole('Loading repeater info...', 'info');
        
        // Show loading indicator and disable all buttons
        document.getElementById('loadingIndicator').style.display = 'flex';
        this.setButtonsEnabled(false);
        
        // Wait a bit before starting to ensure connection is stable
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Undocumented commands
        await this.sendCommand('board');
        await new Promise(resolve => setTimeout(resolve, 400));
        
        // Get private key (this will also derive public key)
        await this.sendCommand('get prv.key');
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Documented commands
        await this.sendCommand('ver');
        await new Promise(resolve => setTimeout(resolve, 300));
        
        await this.sendCommand('clock');
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Try get commands for settings (set X -> get X)
        await this.sendCommand('get name');
        await new Promise(resolve => setTimeout(resolve, 300));
        
        await this.sendCommand('get lat');
        await new Promise(resolve => setTimeout(resolve, 300));
        
        await this.sendCommand('get lon');
        await new Promise(resolve => setTimeout(resolve, 300));
        
        await this.sendCommand('get radio');
        await new Promise(resolve => setTimeout(resolve, 300));
        
        await this.sendCommand('get af');
        await new Promise(resolve => setTimeout(resolve, 300));
        
        await this.sendCommand('get tx');
        await new Promise(resolve => setTimeout(resolve, 300));
        
        await this.sendCommand('get repeat');
        await new Promise(resolve => setTimeout(resolve, 300));
        
        await this.sendCommand('get advert.interval');
        await new Promise(resolve => setTimeout(resolve, 300));
        
        await this.sendCommand('get acl');
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Done loading
        document.getElementById('loadingIndicator').style.display = 'none';
        this.setButtonsEnabled(true);
        this.logToConsole('✓ All settings loaded successfully', 'info');
    }

    setButtonsEnabled(enabled) {
        // Disable/enable all buttons in Info & Actions (except Connect button)
        const buttons = [
            'btnFloodAdvert', 'btnEnableRepeat', 'btnStartOTA', 
            'btnReboot', 'btnFactoryReset', 'btnReloadInfo',
            'btnSaveSettings', 'btnLoadSettings'
        ];
        
        buttons.forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.disabled = !enabled;
        });
        
        // Disable/enable buttons in other boxes
        const otherButtons = [
            'btnShowMap', 'btnApplyNameLocation', 'btnCloseMap',
            'btnAutoChoose', 'btnChooseFromTable', 'btnGenerate', 'btnSaveSetKey',
            'btnSetPasswords', 'btnSetACL', 'btnApplyRadio'
        ];
        
        otherButtons.forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.disabled = !enabled;
        });
        
        // Console buttons always enabled
        const consoleButtons = ['btnToggleConsole', 'btnClearConsole', 'btnSendManual'];
        consoleButtons.forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.disabled = false;
        });
        
        // Disable/enable input fields
        const inputs = [
            'nodeName', 'latitude', 'longitude', 'desiredId',
            'adminPassword', 'guestPassword', 'aclPubkey', 'aclPermission',
            'preset', 'frequency', 'bandwidth', 'spreadingFactor', 
            'codingRate', 'txPower', 'airtimeFactor'
        ];
        
        inputs.forEach(id => {
            const input = document.getElementById(id);
            if (input) input.disabled = !enabled;
        });
        
        // Manual command input - only enabled when connected
        const manualCommand = document.getElementById('manualCommand');
        if (manualCommand) manualCommand.disabled = !enabled;
    }

    confirmAndExecute(message, command) {
        if (confirm(message)) {
            this.sendCommand(command);
        }
    }

    async factoryReset() {
        // First confirmation
        if (!confirm('⚠️ FACTORY RESET WARNING ⚠️\n\nThis will PERMANENTLY ERASE all settings including:\n- Node name and location\n- Private key (your repeater ID will change)\n- All passwords and ACL permissions\n- Radio configuration\n\nAre you sure you want to continue?')) {
            this.logToConsole('Factory reset cancelled', 'info');
            return;
        }
        
        // Second confirmation
        if (!confirm('⚠️ FINAL WARNING ⚠️\n\nThis action CANNOT be undone!\n\nType YES in your mind and click OK to proceed with factory reset.')) {
            this.logToConsole('Factory reset cancelled (2nd confirmation)', 'info');
            return;
        }
        
        this.logToConsole('Executing factory reset...', 'info');
        this.pendingFactoryReset = true;
        await this.sendCommand('erase');
    }

    async loadPresets() {
        try {
            const response = await fetch('/config/proxy-presets.php');
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            const apiPresets = data.config?.suggested_radio_settings?.entries || [];
            
            if (apiPresets.length > 0) {
                this.presets = apiPresets;
                
                // Check if using cached data
                if (data._cache_age_hours !== undefined) {
                    this.logToConsole(`Presets loaded: ${this.presets.length} from cache (${data._cache_age_hours}h old)`, 'info');
                } else {
                    this.logToConsole(`Presets loaded: ${this.presets.length} from API (fresh)`, 'info');
                }
            } else {
                throw new Error('No presets in response');
            }
        } catch (error) {
            this.logToConsole(`Failed to load presets: ${error.message}`, 'error');
            this.presets = [];
        }
        
        // Populate dropdown
        const select = document.getElementById('preset');
        select.innerHTML = '<option value="">Select preset...</option>';
        
        this.presets.forEach(preset => {
            const option = document.createElement('option');
            option.value = preset.title;
            option.textContent = `${preset.title} - ${preset.description}`;
            select.appendChild(option);
        });
    }

    applyPreset(presetName) {
        const preset = this.presets.find(p => p.title === presetName);
        if (!preset) return;

        if (preset.frequency) document.getElementById('frequency').value = parseFloat(preset.frequency).toFixed(3);
        if (preset.bandwidth) document.getElementById('bandwidth').value = preset.bandwidth;
        if (preset.spreading_factor) document.getElementById('spreadingFactor').value = preset.spreading_factor;
        if (preset.coding_rate) document.getElementById('codingRate').value = preset.coding_rate;

        this.validateRadioSettings();
    }

    validateRadioSettings() {
        const freq = parseFloat(document.getElementById('frequency').value);
        const bw = parseFloat(document.getElementById('bandwidth').value);
        const sf = parseInt(document.getElementById('spreadingFactor').value);
        const cr = parseInt(document.getElementById('codingRate').value);
        const pwr = parseInt(document.getElementById('txPower').value);
        const airtime = parseFloat(document.getElementById('airtimeFactor').value);

        let valid = true;
        let errors = [];

        if (freq < 862 || freq > 1020) {
            errors.push('Frequency must be between 862 and 1020 MHz');
            valid = false;
        }

        if (![62.5, 125, 250, 500].includes(bw)) {
            errors.push('Invalid bandwidth');
            valid = false;
        }

        if (sf < 6 || sf > 12) {
            errors.push('Spreading factor must be between 6 and 12');
            valid = false;
        }

        if (cr < 5 || cr > 8) {
            errors.push('Coding rate must be between 5 and 8');
            valid = false;
        }

        if (pwr < 2 || pwr > 22) {
            errors.push('TX power must be between 2 and 22 dBm');
            valid = false;
        }

        if (airtime < 0 || airtime > 1) {
            errors.push('Airtime factor must be between 0 and 1');
            valid = false;
        }

        return valid;
    }

    async applyRadioSettings() {
        if (!this.validateRadioSettings()) {
            alert('Invalid radio settings. Please check the values.');
            return;
        }

        this.logToConsole('Applying radio settings...', 'info');

        const freq = parseFloat(document.getElementById('frequency').value);
        const bw = parseFloat(document.getElementById('bandwidth').value);
        const sf = parseInt(document.getElementById('spreadingFactor').value);
        const cr = parseInt(document.getElementById('codingRate').value);
        const pwr = parseInt(document.getElementById('txPower').value);
        const airtime = parseFloat(document.getElementById('airtimeFactor').value);

        // Use the set radio command to set freq, bw, sf, cr all at once (requires reboot)
        await this.sendCommand(`set radio ${freq},${bw},${sf},${cr}`);
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Set TX power
        await this.sendCommand(`set tx ${pwr}`);
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Set airtime factor
        await this.sendCommand(`set af ${airtime}`);
        await new Promise(resolve => setTimeout(resolve, 200));

        this.logToConsole('Radio settings applied (reboot required for freq/bw/sf/cr)', 'info');
        alert('Radio settings applied. Reboot required for frequency/bandwidth/SF/CR changes to take effect.');
    }

    async applyNameLocation() {
        const name = document.getElementById('nodeName').value;
        const lat = parseFloat(document.getElementById('latitude').value);
        const lon = parseFloat(document.getElementById('longitude').value);

        if (!name || name.trim().length === 0) {
            alert('Please enter a node name');
            return;
        }

        if (isNaN(lat) || isNaN(lon)) {
            alert('Invalid coordinates');
            return;
        }

        await this.sendCommand(`set name ${name}`);
        await new Promise(resolve => setTimeout(resolve, 100));
        await this.sendCommand(`set lat ${lat}`);
        await new Promise(resolve => setTimeout(resolve, 100));
        await this.sendCommand(`set lon ${lon}`);
        
        this.logToConsole('Name & location applied', 'info');
    }

    async setPasswords() {
        const adminPwd = document.getElementById('adminPassword').value;
        const guestPwd = document.getElementById('guestPassword').value;

        if (!adminPwd || adminPwd.trim().length === 0) {
            if (!confirm('Admin password is empty. Continue anyway?')) {
                return;
            }
        }

        if (adminPwd) {
            await this.sendCommand(`password ${adminPwd}`);
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        if (guestPwd) {
            await this.sendCommand(`set guest.password ${guestPwd}`);
        }
        
        this.logToConsole('Passwords set', 'info');
    }

    showMap() {
        const mapContainer = document.getElementById('mapContainer');
        mapContainer.style.display = 'block';

        // Wait for container to be visible before initializing map
        setTimeout(() => {
            if (!this.map) {
                try {
                    // Use exact same initialization as Meshlog (which works on server)
                    this.map = L.map('map').setView([47.2, 19.5], 6);
                    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
                        maxZoom: 19,
                        attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    }).addTo(this.map);

                    this.map.on('click', (e) => {
                        const { lat, lng } = e.latlng;
                        document.getElementById('latitude').value = lat.toFixed(6);
                        document.getElementById('longitude').value = lng.toFixed(6);

                        // Remove old marker if exists
                        if (this.marker) {
                            this.map.removeLayer(this.marker);
                        }
                        
                        // Use a simple circle marker instead of default icon
                        this.marker = L.circleMarker(e.latlng, {
                            radius: 10,
                            fillColor: '#2563eb',
                            color: '#fff',
                            weight: 2,
                            opacity: 1,
                            fillOpacity: 0.8
                        }).addTo(this.map);
                        
                        this.logToConsole(`Location set: ${lat.toFixed(6)}, ${lng.toFixed(6)}`, 'info');
                    });
                    
                    this.logToConsole('Map initialized', 'info');
                } catch (error) {
                    console.error('Map initialization error:', error);
                    this.logToConsole('Map error: ' + error.message, 'error');
                    alert('Failed to initialize map: ' + error.message);
                    return;
                }
            } else {
                // Map already exists, just resize it
                this.map.invalidateSize();
            }

            // Set view to current coordinates if available
            const lat = parseFloat(document.getElementById('latitude').value);
            const lon = parseFloat(document.getElementById('longitude').value);
            if (!isNaN(lat) && !isNaN(lon) && (lat !== 0 || lon !== 0)) {
                this.map.setView([lat, lon], 13);
                
                // Remove old marker if exists
                if (this.marker) {
                    this.map.removeLayer(this.marker);
                }
                
                // Add circle marker at current position
                this.marker = L.circleMarker([lat, lon], {
                    radius: 10,
                    fillColor: '#2563eb',
                    color: '#fff',
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.8
                }).addTo(this.map);
            }
        }, 100);
    }

    hideMap() {
        document.getElementById('mapContainer').style.display = 'none';
    }

    async autoChooseId() {
        try {
            const occupiedIds = await this.fetchOccupiedIds();

            const unoccupiedIds = [];
            for (let i = 1; i <= 254; i++) {
                const hexId = i.toString(16).padStart(2, '0').toUpperCase();
                if (!occupiedIds.has(hexId)) {
                    unoccupiedIds.push(hexId);
                }
            }

            if (unoccupiedIds.length > 0) {
                const randomId = unoccupiedIds[Math.floor(Math.random() * unoccupiedIds.length)];
                document.getElementById('desiredId').value = randomId;
                this.logToConsole(`Auto-selected unoccupied ID: ${randomId}`, 'info');
            } else {
                alert('No unoccupied IDs available');
            }
        } catch (error) {
            console.error('Failed to fetch collision data:', error);
            alert('Failed to check occupied IDs. Using random ID.');
            const randomId = Math.floor(Math.random() * 254 + 1).toString(16).padStart(2, '0').toUpperCase();
            document.getElementById('desiredId').value = randomId;
        }
    }

    async showCollisionHelperModal() {
        const modal = document.getElementById('modalOverlay');
        modal.style.display = 'flex';

        try {
            const occupiedIds = await this.fetchOccupiedIds();
            this.renderCollisionHelper(occupiedIds);
        } catch (error) {
            console.error('Failed to fetch collision data:', error);
            alert('Failed to load collision data.');
            modal.style.display = 'none';
            return;
        }

        modal.querySelector('.btn-close').onclick = () => {
            modal.style.display = 'none';
        };
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        };
    }

    async fetchOccupiedIds() {
        try {
            const response = await fetch('/api/v1/all', {
                headers: {
                    'Accept': 'application/json',
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            const occupied = new Map();
            
            // Check different possible response structures
            let contacts = null;
            if (data.contacts && data.contacts.objects) {
                contacts = data.contacts.objects;
            } else if (data.contacts && Array.isArray(data.contacts)) {
                contacts = data.contacts;
            } else if (Array.isArray(data)) {
                contacts = data;
            }
            
            if (contacts) {
                let repeaterCount = 0;
                contacts.forEach(contact => {
                    // Check if contact has an advertisement and if it's a repeater (type 2)
                    if (contact.advertisement && contact.advertisement.type === 2 && contact.public_key) {
                        const pubkey = contact.public_key;
                        const id = pubkey.substring(0, 2).toUpperCase();
                        if (!occupied.has(id)) {
                            occupied.set(id, []);
                        }
                        occupied.get(id).push(contact.advertisement.name || 'Unknown');
                        repeaterCount++;
                    }
                });
                this.logToConsole(`Collision check: ${repeaterCount} repeaters, ${occupied.size} unique IDs`, 'info');
            } else {
                throw new Error('No contacts found in API response');
            }
            
            return occupied;
        } catch (error) {
            this.logToConsole(`Collision check failed: ${error.message}`, 'error');
            throw error;
        }
    }

    renderCollisionHelper(occupiedIds) {
        const grid = document.getElementById('hexGrid');
        grid.innerHTML = '';

        for (let i = 1; i <= 254; i++) {
            const hexId = i.toString(16).padStart(2, '0').toUpperCase();
            const cell = document.createElement('div');
            cell.className = 'hex-cell';
            cell.textContent = hexId;

            if (occupiedIds.has(hexId)) {
                const names = occupiedIds.get(hexId);
                if (names.length > 1) {
                    cell.classList.add('colliding');
                    cell.title = `Colliding:\n${names.join('\n')}`;
                } else {
                    cell.classList.add('occupied');
                    cell.title = `Occupied: ${names[0]}`;
                }
            } else {
                cell.classList.add('unoccupied');
                cell.title = 'Unoccupied';
            }

            cell.addEventListener('click', () => {
                document.getElementById('desiredId').value = hexId;
                document.getElementById('modalOverlay').style.display = 'none';
            });

            grid.appendChild(cell);
        }
    }

    validateDesiredId(value) {
        const warningEl = document.getElementById('invalidIdWarning');
        if (!warningEl) return;
        
        if (value && value.length === 2) {
            const upper = value.toUpperCase();
            if (upper === '00' || upper === 'FF') {
                warningEl.style.display = 'block';
                return false;
            } else {
                warningEl.style.display = 'none';
                return true;
            }
        }
        warningEl.style.display = 'none';
        return true;
    }

    async generateKeys() {
        const desiredId = document.getElementById('desiredId').value;
        
        if (!desiredId || desiredId.length !== 2 || !/^[0-9A-Fa-f]{2}$/.test(desiredId)) {
            alert('Please enter a valid 2-character hex ID');
            return;
        }
        
        // Check for invalid IDs that cannot be generated
        const upperId = desiredId.toUpperCase();
        if (upperId === '00' || upperId === 'FF') {
            alert('IDs starting with "00" or "FF" cannot be generated.\n\nValid Ed25519 public keys never start with these values.\n\nPlease choose an ID between 01-FE.');
            return;
        }

        // Hide compliance status during generation
        const complianceStatus = document.getElementById('complianceStatus');
        complianceStatus.style.display = 'none';

        // Show progress modal
        const progressModal = document.getElementById('progressModal');
        const progressText = document.getElementById('progressText');
        const progressStats = document.getElementById('progressStats');
        progressModal.style.display = 'flex';

        const targetId = desiredId.toLowerCase();
        const maxAttempts = 3;
        const candidates = [];
        const startTime = Date.now();
        let totalIterations = 0;

        try {
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                progressText.textContent = `Generating key ${attempt + 1} of ${maxAttempts}...`;
                
                let found = false;
                let iterations = 0;
                const maxIterations = 100000;

                // Use async generation to not freeze browser
                while (!found && iterations < maxIterations) {
                    // Batch generations and yield to UI every 1000 iterations
                    if (iterations % 1000 === 0) {
                        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                        const rate = Math.floor(totalIterations / elapsed);
                        progressStats.textContent = `Attempts: ${totalIterations} | Speed: ${rate}/sec | Time: ${elapsed}s`;
                        await new Promise(resolve => setTimeout(resolve, 0));
                    }

                    // Generate MeshCore-compatible key pair
                    const meshCoreKeyPair = await this.generateKeyPair();
                    const publicKeyHex = meshCoreKeyPair.public;
                    
                    if (publicKeyHex.substring(0, 2).toLowerCase() === targetId) {
                        candidates.push(meshCoreKeyPair);
                        found = true;
                    }
                    iterations++;
                    totalIterations++;
                }
            }

            progressModal.style.display = 'none';

            if (candidates.length === 0) {
                alert('Failed to generate keys matching the desired ID. Try again.');
                return;
            }

            const selected = candidates[Math.floor(Math.random() * candidates.length)];
            document.getElementById('privateKey').value = selected.private;
            document.getElementById('generatedPublicKey').value = selected.public;
            
            this.logToConsole(`Generated key with ID ${desiredId} (${totalIterations} attempts, ${((Date.now() - startTime) / 1000).toFixed(1)}s)`, 'info');
            
            // Show RFC 8032 compliance status in UI
            const complianceStatus = document.getElementById('complianceStatus');
            if (selected.compliance && selected.compliance.valid) {
                complianceStatus.style.display = 'flex';
                complianceStatus.querySelector('.compliance-icon').textContent = '✓';
                complianceStatus.querySelector('.compliance-text').textContent = 'RFC 8032 Ed25519 compliant - Proper SHA-512 expansion, scalar clamping, and key consistency verified';
                complianceStatus.style.background = '#1a5a1a';
                complianceStatus.style.borderColor = '#4ade80';
                complianceStatus.querySelector('.compliance-icon').style.color = '#4ade80';
                
                this.logToConsole('✓ RFC 8032 Ed25519 compliant - Proper SHA-512 expansion, scalar clamping, and key consistency verified', 'info');
            } else if (selected.compliance) {
                complianceStatus.style.display = 'flex';
                complianceStatus.querySelector('.compliance-icon').textContent = '⚠';
                complianceStatus.querySelector('.compliance-text').textContent = `RFC 8032 compliance issues: ${selected.compliance.error}`;
                complianceStatus.style.background = '#5a1a1a';
                complianceStatus.style.borderColor = '#f87171';
                complianceStatus.querySelector('.compliance-icon').style.color = '#f87171';
                
                this.logToConsole(`⚠ RFC 8032 compliance issues: ${selected.compliance.error}`, 'error');
            } else {
                complianceStatus.style.display = 'none';
            }
            
            // Update repeater ID display with collision check
            const repeaterId = selected.public.substring(0, 2).toUpperCase();
            await this.updateRepeaterIdDisplay(repeaterId);
        } catch (error) {
            progressModal.style.display = 'none';
            console.error('Key generation error:', error);
            alert('Key generation failed: ' + error.message);
        }
    }

    async generateKeyPair() {
        // Use the exact same implementation as meshcore-web-keygen
        await this.initializeNobleEd25519();
        
        // Step 1: Generate 32-byte random seed
        const seed = crypto.getRandomValues(new Uint8Array(32));
        
        // Step 2: Hash the seed with SHA-512
        const digest = await crypto.subtle.digest('SHA-512', seed);
        const digestArray = new Uint8Array(digest);
        
        // Step 3: Clamp the first 32 bytes according to Ed25519 rules
        const clamped = new Uint8Array(digestArray.slice(0, 32));
        clamped[0] &= 248;  // Clear bottom 3 bits (make it divisible by 8)
        clamped[31] &= 63;  // Clear top 2 bits
        clamped[31] |= 64;  // Set bit 6 (ensure it's in the right range)
        
        // Step 4: Use the clamped scalar to generate the public key
        let publicKey;
        try {
            // Convert scalar to BigInt for Point.BASE.multiply
            let scalarBigInt = 0n;
            for (let i = 0; i < 32; i++) {
                scalarBigInt += BigInt(clamped[i]) << BigInt(8 * i);
            }
            publicKey = this.nobleEd25519.Point.BASE.multiply(scalarBigInt);
        } catch (error) {
            // Fallback to getPublicKey if Point.BASE.multiply fails
            try {
                publicKey = await this.nobleEd25519.getPublicKey(clamped);
            } catch (fallbackError) {
                publicKey = this.nobleEd25519.getPublicKey(clamped);
            }
        }
        
        // Convert public key to Uint8Array
        let publicKeyBytes;
        if (publicKey instanceof Uint8Array) {
            publicKeyBytes = publicKey;
        } else if (publicKey.toRawBytes) {
            publicKeyBytes = publicKey.toRawBytes();
        } else if (publicKey.toBytes) {
            publicKeyBytes = publicKey.toBytes();
        } else if (publicKey.x !== undefined && publicKey.y !== undefined) {
            // Point object with x, y coordinates - convert to compressed format
            publicKeyBytes = new Uint8Array(32);
            const y = publicKey.y;
            const x = publicKey.x;
            
            // Copy y-coordinate (little-endian)
            for (let i = 0; i < 31; i++) {
                publicKeyBytes[i] = Number((y >> BigInt(8 * i)) & 255n);
            }
            // Set the sign bit based on x-coordinate
            publicKeyBytes[31] = Number((x & 1n) << 7);
        } else {
            throw new Error(`Unsupported public key format from noble-ed25519: ${publicKey.constructor.name}`);
        }
        
        // Step 5: Create 64-byte private key: [clamped_scalar][sha512_second_half]
        const meshCorePrivateKey = new Uint8Array(64);
        meshCorePrivateKey.set(clamped, 0);                    // First 32 bytes: clamped scalar
        meshCorePrivateKey.set(digestArray.slice(32, 64), 32); // Second 32 bytes: SHA-512(seed)[32:64]
        
        // Verify RFC 8032 Ed25519 compliance using the same validation as meshcore-web-keygen
        const complianceCheck = await this.validateKeypair(this.uint8ArrayToHex(meshCorePrivateKey), this.uint8ArrayToHex(publicKeyBytes));
        
        const result = {
            private: this.uint8ArrayToHex(meshCorePrivateKey),
            public: this.uint8ArrayToHex(publicKeyBytes),
            compliance: complianceCheck
        };
        
        // Debug logging
        console.log('Generated public key:', result.public);
        console.log('Generated public key starts with:', result.public.substring(0, 2).toUpperCase());
        
        return result;
    }

    async initializeNobleEd25519() {
        if (!this.nobleEd25519) {
            try {
                // Try Skypack first since it works
                this.nobleEd25519 = await import('https://cdn.skypack.dev/noble-ed25519');
                console.log('✓ noble-ed25519 loaded successfully from Skypack');
            } catch (error) {
                console.error('Failed to load noble-ed25519 from Skypack, trying offline fallback:', error);
                try {
                    // Use offline fallback
                    this.nobleEd25519 = await import('./noble-ed25519-offline-simple.js');
                    console.log('✓ noble-ed25519 loaded successfully (offline fallback)');
                } catch (offlineError) {
                    console.error('Failed to load noble-ed25519 from all sources:', offlineError);
                    throw new Error('Failed to load Ed25519 library. Please check your internet connection and ensure noble-ed25519-offline-simple.js is available.');
                }
            }
        }
    }

    // Validate keypair using the exact same logic as meshcore-web-keygen
    async validateKeypair(privateKeyHex, publicKeyHex) {
        try {
            // Ensure library is loaded
            await this.initializeNobleEd25519();
            
            // Convert hex strings back to Uint8Array
            const privateKeyBytes = new Uint8Array(
                privateKeyHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
            );
            
            if (privateKeyBytes.length !== 64) {
                return { valid: false, error: 'Private key must be 64 bytes' };
            }
            
            // Extract the clamped scalar (first 32 bytes) - this is what MeshCore actually uses
            const clampedScalar = privateKeyBytes.slice(0, 32);
            
            // 1. Check that the private key is not all zeros
            if (clampedScalar.every(byte => byte === 0)) {
                return { valid: false, error: 'Private key cannot be all zeros' };
            }
            
            // 2. Validate Ed25519 scalar clamping rules (matches Python implementation)
            if ((clampedScalar[0] & 7) !== 0) {
                return { valid: false, error: 'Private key scalar not properly clamped (bits 0-2 should be 0)' };
            }
            
            if ((clampedScalar[31] & 192) !== 64) {
                return { valid: false, error: 'Private key scalar not properly clamped (bits 6 should be 1, bits 7 should be 0)' };
            }
            
            // 3. Check public key format
            const publicKeyBytes = new Uint8Array(
                publicKeyHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
            );
            
            if (publicKeyBytes.length !== 32) {
                return { valid: false, error: 'Public key must be 32 bytes' };
            }
            
            if (publicKeyBytes.every(byte => byte === 0)) {
                return { valid: false, error: 'Public key cannot be all zeros' };
            }
            
            // 4. CRITICAL: Verify that the private key actually generates the claimed public key
            // This matches the Python implementation's verify_key_compatibility function
            try {
                // Use Point.BASE.multiply which accepts pre-clamped scalars (no double clamping)
                let derivedPublicKey;
                try {
                    // Convert scalar to BigInt for Point.BASE.multiply
                    let scalarBigInt = 0n;
                    for (let i = 0; i < 32; i++) {
                        scalarBigInt += BigInt(clampedScalar[i]) << BigInt(8 * i);
                    }
                    derivedPublicKey = this.nobleEd25519.Point.BASE.multiply(scalarBigInt);
                } catch (error) {
                    // Fallback to getPublicKey if Point.BASE.multiply fails
                    try {
                        derivedPublicKey = await this.nobleEd25519.getPublicKey(clampedScalar);
                    } catch (fallbackError) {
                        derivedPublicKey = this.nobleEd25519.getPublicKey(clampedScalar);
                    }
                }
                
                // Convert to Uint8Array if needed
                let derivedPublicKeyBytes;
                if (derivedPublicKey instanceof Uint8Array) {
                    derivedPublicKeyBytes = derivedPublicKey;
                } else if (derivedPublicKey.toRawBytes) {
                    derivedPublicKeyBytes = derivedPublicKey.toRawBytes();
                } else if (derivedPublicKey.toBytes) {
                    derivedPublicKeyBytes = derivedPublicKey.toBytes();
                } else if (derivedPublicKey.x !== undefined && derivedPublicKey.y !== undefined) {
                    // Point object with x, y coordinates - convert to compressed format
                    derivedPublicKeyBytes = new Uint8Array(32);
                    const y = derivedPublicKey.y;
                    const x = derivedPublicKey.x;
                    
                    // Copy y-coordinate (little-endian)
                    for (let i = 0; i < 31; i++) {
                        derivedPublicKeyBytes[i] = Number((y >> BigInt(8 * i)) & 255n);
                    }
                    // Set the sign bit based on x-coordinate
                    derivedPublicKeyBytes[31] = Number((x & 1n) << 7);
                } else {
                    console.error('Unsupported derived public key format:', derivedPublicKey);
                    throw new Error(`Unsupported public key format from noble-ed25519: ${derivedPublicKey.constructor.name}`);
                }
                
                const derivedPublicHex = this.uint8ArrayToHex(derivedPublicKeyBytes);
                
                if (derivedPublicHex !== publicKeyHex) {
                    return { 
                        valid: false, 
                        error: `Key verification failed: private key does not generate the claimed public key` 
                    };
                }
            } catch (error) {
                return { 
                    valid: false, 
                    error: `Key verification failed: ${error.message}` 
                };
            }
            
            return { valid: true };
        } catch (error) {
            return { valid: false, error: `Validation error: ${error.message}` };
        }
    }



    clearComplianceStatus() {
        const complianceStatus = document.getElementById('complianceStatus');
        complianceStatus.style.display = 'none';
    }

    uint8ArrayToHex(uint8Array) {
        return Array.from(uint8Array)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    hexToUint8Array(hex) {
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < hex.length; i += 2) {
            bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
        }
        return bytes;
    }

    async setPrivateKey() {
        const privateKey = document.getElementById('privateKey').value;
        const publicKey = document.getElementById('generatedPublicKey').value;

        if (!privateKey || !publicKey) {
            alert('Please generate keys first');
            return;
        }

        try {
            // Verify the key format (should be 128 hex characters = 64 bytes)
            if (privateKey.length !== 128) {
                alert('Invalid private key format. Expected 128 hex characters (64 bytes).');
                return;
            }

            const privateKeyBytes = this.hexToUint8Array(privateKey);
            
            // For MeshCore format, verify that the private scalar generates the correct public key
            // The private key contains: 32-byte private scalar + 32-byte SHA-512 second half
            const privateScalar = privateKeyBytes.slice(0, 32);  // First 32 bytes: private scalar

            // Verify using noble-ed25519 that the private scalar generates the correct public key
            await this.initializeNobleEd25519();
            let scalarBigInt = 0n;
            for (let i = 0; i < 32; i++) {
                scalarBigInt += BigInt(privateScalar[i]) << BigInt(8 * i);
            }
            const noblePublicKey = this.nobleEd25519.Point.BASE.multiply(scalarBigInt);
            const noblePublicKeyBytes = noblePublicKey.toRawBytes ? noblePublicKey.toRawBytes() : noblePublicKey.toBytes();
            const noblePublicKeyHex = this.uint8ArrayToHex(noblePublicKeyBytes);

            if (noblePublicKeyHex !== publicKey) {
                alert('Key verification failed. Private key does not match public key.');
                return;
            }

            await this.sendCommand(`set prv.key ${privateKey}`);
            
            // Update repeater ID display
            const repeaterId = publicKey.substring(0, 2).toUpperCase();
            await this.updateRepeaterIdDisplay(repeaterId);
            
            alert('Private key set successfully');
        } catch (error) {
            console.error('Key verification error:', error);
            alert('Failed to verify/set key: ' + error.message);
        }
    }

    async setACL() {
        const pubkey = document.getElementById('aclPubkey').value.trim();
        const permission = document.getElementById('aclPermission').value;

        if (!pubkey || (pubkey.length !== 64 && pubkey.length < 2)) {
            alert('Please enter a valid public key (64 chars) or prefix (min 2 chars)');
            return;
        }

        await this.sendCommand(`setperm ${pubkey} ${permission}`);
        
        // Reload ACL after setting
        await new Promise(resolve => setTimeout(resolve, 200));
        await this.sendCommand('get acl');
        
        document.getElementById('aclPubkey').value = '';
    }

    async saveSettings() {
        const settings = {
            // Name & Location
            nodeName: document.getElementById('nodeName').value,
            latitude: document.getElementById('latitude').value,
            longitude: document.getElementById('longitude').value,
            
            // Keys
            privateKey: document.getElementById('privateKey').value,
            publicKey: document.getElementById('generatedPublicKey').value,
            
            // Access
            adminPassword: document.getElementById('adminPassword').value,
            guestPassword: document.getElementById('guestPassword').value,
            aclEntries: this.aclEntries,
            
            // Radio Settings
            frequency: document.getElementById('frequency').value,
            bandwidth: document.getElementById('bandwidth').value,
            spreadingFactor: document.getElementById('spreadingFactor').value,
            codingRate: document.getElementById('codingRate').value,
            txPower: document.getElementById('txPower').value,
            airtimeFactor: document.getElementById('airtimeFactor').value,
            preset: document.getElementById('preset').value,
            
            // Status (read-only, just for reference)
            boardType: document.getElementById('boardType').textContent,
            fwVersion: document.getElementById('fwVersion').textContent,
            repeaterId: document.getElementById('repeaterId').textContent,
            repeatMode: this.repeatMode,
            
            // Metadata
            timestamp: new Date().toISOString()
        };

        // Ask user to change filename
        const nodeName = (settings.nodeName || 'repeater').replace(/[^a-zA-Z0-9-]/g, '_');
        const repeaterId = settings.repeaterId || 'XX';
        const now = new Date();
        const date = now.toISOString().split('T')[0].replace(/-/g, '');
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const time = `${hours}_${minutes}`;
        
        const defaultFilename = `${nodeName}_${repeaterId}_${date}_${time}`;
        
        const filename = prompt('CHANGE filename before saving (without .json extension):', defaultFilename);
        
        if (!filename) {
            this.logToConsole('Settings save cancelled', 'info');
            return;
        }
        
        const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        this.logToConsole(`Settings saved to ${filename}.json`, 'info');
    }

    loadSettings() {
        const input = document.getElementById('fileInput');
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const text = await file.text();
                const settings = JSON.parse(text);

                this.logToConsole('Loading settings from file...', 'info');

                // Load Name & Location
                if (settings.nodeName) {
                    document.getElementById('nodeName').value = settings.nodeName;
                }
                if (settings.latitude) {
                    document.getElementById('latitude').value = settings.latitude;
                }
                if (settings.longitude) {
                    document.getElementById('longitude').value = settings.longitude;
                }
                
                // Apply Name & Location
                if (settings.nodeName || settings.latitude || settings.longitude) {
                    await this.applyNameLocation();
                    await new Promise(resolve => setTimeout(resolve, 200));
                }

                // Load and set Private Key
                if (settings.privateKey) {
                    document.getElementById('privateKey').value = settings.privateKey;
                    if (settings.publicKey) {
                        document.getElementById('generatedPublicKey').value = settings.publicKey;
                    }
                    // Clear compliance status when loading keys from file
                    this.clearComplianceStatus();
                    await this.setPrivateKey();
                    await new Promise(resolve => setTimeout(resolve, 200));
                }

                // Load Passwords
                if (settings.adminPassword) {
                    document.getElementById('adminPassword').value = settings.adminPassword;
                }
                if (settings.guestPassword) {
                    document.getElementById('guestPassword').value = settings.guestPassword;
                }
                
                // Apply Passwords
                if (settings.adminPassword || settings.guestPassword) {
                    await this.setPasswords();
                    await new Promise(resolve => setTimeout(resolve, 200));
                }

                // Load Radio Settings
                if (settings.frequency) document.getElementById('frequency').value = parseFloat(settings.frequency).toFixed(3);
                if (settings.bandwidth) document.getElementById('bandwidth').value = settings.bandwidth;
                if (settings.spreadingFactor) document.getElementById('spreadingFactor').value = settings.spreadingFactor;
                if (settings.codingRate) document.getElementById('codingRate').value = settings.codingRate;
                if (settings.txPower) document.getElementById('txPower').value = settings.txPower;
                if (settings.airtimeFactor) document.getElementById('airtimeFactor').value = settings.airtimeFactor;
                if (settings.preset) document.getElementById('preset').value = settings.preset;

                // Apply Radio Settings
                if (settings.frequency || settings.bandwidth || settings.spreadingFactor || settings.codingRate || settings.txPower || settings.airtimeFactor) {
                    await this.applyRadioSettings();
                    await new Promise(resolve => setTimeout(resolve, 200));
                }

                // Apply ACL entries
                if (settings.aclEntries && Array.isArray(settings.aclEntries) && settings.aclEntries.length > 0) {
                    this.logToConsole(`Restoring ${settings.aclEntries.length} ACL entries...`, 'info');
                    for (const entry of settings.aclEntries) {
                        const parts = entry.split(/\s+/);
                        if (parts.length >= 2) {
                            await this.sendCommand(`setperm ${parts[0]} ${parts[1]}`);
                            await new Promise(resolve => setTimeout(resolve, 200));
                        }
                    }
                    await this.sendCommand('get acl');
                }

                // Apply repeat mode if saved
                if (settings.repeatMode !== undefined && settings.repeatMode !== null) {
                    const targetMode = settings.repeatMode;
                    if (targetMode !== this.repeatMode) {
                        await this.sendCommand(`set repeat ${targetMode ? 'on' : 'off'}`);
                        await new Promise(resolve => setTimeout(resolve, 200));
                    }
                }

                this.logToConsole('All settings loaded and applied', 'info');
                alert('Settings loaded and applied successfully');
            } catch (error) {
                console.error('Failed to load settings:', error);
                alert('Failed to load settings: ' + error.message);
            }
        };
        input.click();
    }
}

const app = new RepeaterSetup();

