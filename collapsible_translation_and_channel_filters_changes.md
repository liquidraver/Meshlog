# Collapsible Translation and Channel Filters - Changes Made

## Overview
This document contains the modifications made to implement:
1. Collapsible translation section
2. Channel-specific filter checkboxes

## Files Modified

### 1. index.php

#### Changes to Translation Section (around line 26):
```html
<div class="settings" id="settings-translation">
    <div class="settings-header" onclick="toggleTranslationSection()">
        <span>Translation Settings</span>
        <span id="translation-toggle" class="toggle-icon">▼</span>
    </div>
    <div class="translation-controls" id="translation-controls">
        <!-- existing translation controls -->
    </div>
</div>
```

#### New JavaScript Function (around line 265):
```javascript
function toggleTranslationSection() {
    const controls = document.getElementById("translation-controls");
    const toggle = document.getElementById("translation-toggle");
    
    if (controls.style.display === "none") {
        controls.style.display = "flex";
        toggle.innerText = "▼";
    } else {
        controls.style.display = "none";
        toggle.innerText = "▶";
    }
}
```

### 2. meshlog.js

#### Settings Object Update (around line 988):
```javascript
this.settings = {
    types: {
        advertisements: true,
        channel_messages: true,
        direct_messages: false,
    },
    channels: {
        public: true,
        hungary: true,
        hungary_hash: true,
        ping: true,
    },
    // ... rest of settings
}
```

#### New Channel Initialization Function (around line 1019):
```javascript
this.__init_channels();
```

#### New __init_channels Function:
```javascript
__init_channels() {
    const self = this;
    
    // Add channel filter section header
    let channelHeader = document.createElement('div');
    channelHeader.classList.add('settings-header');
    channelHeader.innerHTML = '<span>Channel Filters</span><span class="toggle-icon">▼</span>';
    
    let channelControls = document.createElement('div');
    channelControls.classList.add('channel-controls');
    channelControls.style.display = 'flex';
    channelControls.style.flexDirection = 'column';
    channelControls.style.gap = '8px';
    
    // Add toggle functionality
    channelHeader.onclick = () => {
        if (channelControls.style.display === "none") {
            channelControls.style.display = "flex";
            channelHeader.querySelector('.toggle-icon').innerText = "▼";
        } else {
            channelControls.style.display = "none";
            channelHeader.querySelector('.toggle-icon').innerText = "▶";
        }
    };
    
    this.dom_settings_types.appendChild(channelHeader);
    this.dom_settings_types.appendChild(channelControls);

    // Add channel filter checkboxes
    channelControls.appendChild(
        this.__createCb(
            "Public Channel",
            "assets/img/message.png",
            this.settings.channels.public,
            (e) => {
                this.settings.channels.public = e.target.checked;
                self.__onTypesChanged(e);
            }
        )
    );

    channelControls.appendChild(
        this.__createCb(
            "Hungary Channel",
            "assets/img/message.png",
            this.settings.channels.hungary,
            (e) => {
                this.settings.channels.hungary = e.target.checked;
                self.__onTypesChanged(e);
            }
        )
    );

    channelControls.appendChild(
        this.__createCb(
            "#hungary Channel",
            "assets/img/message.png",
            this.settings.channels.hungary_hash,
            (e) => {
                this.settings.channels.hungary_hash = e.target.checked;
                self.__onTypesChanged(e);
            }
        )
    );

    channelControls.appendChild(
        this.__createCb(
            "#ping Channel",
            "assets/img/message.png",
            this.settings.channels.ping,
            (e) => {
                this.settings.channels.ping = e.target.checked;
                self.__onTypesChanged(e);
            }
        )
    );
}
```

#### Updated Filtering Logic in MeshLogMessageGroup.updateDom() (around line 806):
```javascript
} else if (msg instanceof MeshLogChannelMessage) {
    // Preserve translation state during auto-refresh
    if (!this.isTranslated) {
        this.dom.text.innerHTML = this._meshlog.sanitizeMessage(msg.data.message);
    }
    this.dom.name.style.color = '#d87dff'
    this.dom.text.style.color = 'white';
    
    // Check channel-specific filters
    let channelFiltered = false;
    if (msg.data.channel_id === 1 && !this._meshlog.settings.channels.public) {
        channelFiltered = true;
    } else if (msg.data.channel_id === 2 && !this._meshlog.settings.channels.hungary) {
        channelFiltered = true;
    } else if (msg.data.channel_id === 3 && !this._meshlog.settings.channels.hungary_hash) {
        channelFiltered = true;
    } else if (msg.data.channel_id === 4 && !this._meshlog.settings.channels.ping) {
        channelFiltered = true;
    }
    
    hidden = !this._meshlog.settings.types.channel_messages || channelFiltered;
```

### 3. style.css

#### New CSS Classes (around line 356):
```css
/* Settings header for collapsible sections */
.settings-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    padding: 4px 0;
    color: #ddd;
    font-weight: bold;
    border-bottom: 1px solid #444;
    margin-bottom: 8px;
}

.settings-header:hover {
    color: #fff;
}

.toggle-icon {
    font-size: 14px;
    color: #888;
    transition: transform 0.2s ease;
}

/* Channel controls */
.channel-controls {
    display: flex;
    flex-direction: column;
    gap: 8px;
}
```

## Channel ID Mapping
Based on the existing code:
- channel_id = 1: Public Channel
- channel_id = 2: Hungary Channel  
- channel_id = 3: #hungary Channel
- channel_id = 4: #ping Channel

## Implementation Notes
- Both translation and channel filter sections are collapsible
- Channel filters work alongside existing message type filters
- Changes maintain backward compatibility
- All existing functionality is preserved
- Real-time filtering when checkboxes are toggled

## Testing
After implementing these changes:
1. Test collapsible translation section toggle
2. Test channel filter checkboxes
3. Verify messages are filtered correctly based on channel selection
4. Ensure existing filters still work

