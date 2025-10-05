// TODO: Each Object Type sohuld have its own class with "updateDom()" function, that will update DOM with changed new values

class MeshLogObject {
    constructor(meshlog, data) {
        this._meshlog = meshlog;
        this.data = {};
        this.flags = {};
        this.time = 0;
        this.highlight = false;
        this.merge(data);
    }

    merge(data) {
        // App shouldn't change data. It is updated on new advertisements
        this.data = {...this.data, ...data};
        this.time = new Date(data.created_at).getTime();
    }

    createDom(root) {}

    updateDom() {}

    update() {
        this.updateDom();
    }
}

class MeshLogReporter extends MeshLogObject {}
class MeshLogChannel extends MeshLogObject {}

class MeshLogContact extends MeshLogObject {
    constructor(meshlog, data) {
        super(meshlog, data);
        this.flags.dupe = false;
        this.hash = data.public_key.substr(0, 2).toLowerCase();
        this.messages = {};
    }

    addMessage(msg) {
        this.messages[msg.data.hash] = msg;
    }

    getAllMessages() {
        let grps = [];
        Object.entries(this._meshlog.messages).forEach(([_,grp]) => {
            let add = false;
            Object.entries(grp.messages).forEach(([_,msg]) => {
                if (msg.data.contact_id == this.data.id) {
                    add = true;
                }
            });
            if (add) { grps.push(grp); }
        });

        return grps;
    }

    showNeighbors() {
        const pathId = `${this.pathTag()}_${this.data.id}`;
        if (this._meshlog.map_layers.hasOwnProperty(pathId)) return;
        let links = {};

        // Works only for repeaters and ADV messages
        if (this.isRepeater() || this.isRoom()) {
        Object.entries(this._meshlog.messages).forEach(([_,grp]) => {
            Object.entries(grp.messages).forEach(([_,msg]) => {
                if (!(msg instanceof MeshLogAdvertisement)) return;


                if (msg.isExpired()) return;

                    let path = msg.data.path;
                    let parts = path.split(",");

                    const contact = this._meshlog.contacts[msg.data.contact_id];
                    const idx = parts.indexOf(this.hash);
                    let src = -1;
                    let dst = -1;


                    if (idx == 0) {
                        src = contact ? contact.data.public_key : msg.data.public_key;
                    } else if (idx > 0) {
                        src = parts[idx-1];
                    }

                    if (contact && (contact.isRepeater() || contact.isRoom())) {
                        if (contact.data.id == this.data.id) {
                            dst = parts[0];
                        }
                    }
                        
                    if (idx != -1) {
                        if ((idx + 1) < parts.length) {
                            dst = parts[idx+1];
                        }
                    }

                    if (src != -1) {
                        if (!links.hasOwnProperty(src)) {
                            links[src] = {
                                in: true,
                                out: false
                            };
                        } else {
                            links[src].in = true;
                        }
                    }

                    if (dst != -1) {
                        if (!links.hasOwnProperty(dst)) {
                            links[dst] = {
                                in: false,
                                out: true
                            };
                        } else {
                            links[dst].out = true;
                        }
                    }

                    // If parts is empty, add to incoming
                    // Add to incoming if path is empty (direct) or 
                });
            });
        }

        const _nocoord = function(c) {
            return (!c || c.length != 2 || (c[0] == 0 && c[1] == 0))
        };

        let layers = [];
        let src = [this.adv.data.lat, this.adv.data.lon];
        if (_nocoord(src)) return;

        const ln_weight = 2;
        const ln_outline = 4;
        const ln_offset = 3;


        Object.entries(links).forEach(([hash,dir]) => {
            // Find all contacts with this hash (handles colliding IDs)
            let candidates = [];
            Object.entries(this._meshlog.contacts).forEach(([k,v]) => {
                if (v.hash === hash && v.adv && !v.adv.isVeryExpired()) {
                    candidates.push(v);
                }
            });

            let dst;
            
            // If only one candidate, use it directly
            if (candidates.length === 1) {
                dst = [candidates[0].adv.data.lat, candidates[0].adv.data.lon];
            } else if (candidates.length > 1) {
                // Multiple candidates - select the closest one by distance
                let closestCandidate = candidates[0];
                let minDistance = Infinity;
                
                candidates.forEach(candidate => {
                    let candidateCoords = [candidate.adv.data.lat, candidate.adv.data.lon];
                    if (_nocoord(candidateCoords)) return;
                    
                    const latDiff = Math.abs(src[0] - candidateCoords[0]);
                    const lonDiff = Math.abs(src[1] - candidateCoords[1]);
                    const distanceKm = Math.sqrt(latDiff*latDiff + lonDiff*lonDiff) * 111;
                    
                    if (distanceKm < minDistance) {
                        minDistance = distanceKm;
                        closestCandidate = candidate;
                    }
                });

                dst = [closestCandidate.adv.data.lat, closestCandidate.adv.data.lon];
            } else {
                // No candidates found, skip this connection
                return;
            }

            // Red is incoming
            if (dir.in) {
                layers.push(L.polyline([
                    src,
                    dst
                ], {color: 'white', weight: ln_outline}));

                layers.push(L.polyline([
                    src,
                    dst
                ], {color: '#F44336', weight: ln_weight}));
            }

            // Blue is outgoing
            if (dir.out) {
                let offset = dir.in ? ln_offset : 0;
                layers.push(L.polyline([
                    src,
                    dst
                ], {color: 'white', weight: ln_outline, offset: offset}));

                layers.push(L.polyline([
                    src,
                    dst
                ], {color: '#3949AB', weight: ln_weight, offset: offset}));
            }
        });

        let group = L.layerGroup(layers).addTo(this._meshlog.map);
        this._meshlog.map_layers[pathId] = group;

        return links;
    }

    hideNeighbors() {
        const pathId = `${this.pathTag()}_${this.data.id}`;
        if (!this._meshlog.map_layers.hasOwnProperty(pathId)) return;
        this._meshlog.map.removeLayer(this._meshlog.map_layers[pathId]);
        delete this._meshlog.map_layers[pathId];
    }

    getColor(str) {
        let hash = 0;
        for (let i = 0; i < this.data.name.length; i++) {
          hash = ((hash << 5) - hash) + this.data.name.charCodeAt(i);
          hash |= 0;
        }
        const threeByteHash = hash >>> 0 & 0xFFFFFF;
        return threeByteHash.toString(16).padStart(6, '0');
    }

    createDom(root) {
        if (this.dom) return this.dom.container;

        let container = document.createElement("div");

        let group = document.createElement("div");
        group.classList.add("log-entry");

        let name = document.createElement("span");
        name.classList.add("sp");
        name.classList.add("t");

        let date = document.createElement("span");
        date.classList.add("sp");
        date.classList.add("c");

        let hash = document.createElement("span");
        hash.classList.add("sp");

        let icon = document.createElement("img");
        icon.classList.add("ti");


        let details = document.createElement("div");

        let type = document.createElement("div");
        type.classList.add("sp");

        let pubkey = document.createElement("div");
        pubkey.classList.add("sp");
        pubkey.style.wordBreak = 'break-all';


        group.appendChild(date);
        group.appendChild(icon);
        group.appendChild(hash);
        group.appendChild(name);

        details.appendChild(type);
        details.appendChild(pubkey);
        details.hidden = true;

        container.appendChild(group);
        container.appendChild(details);

        const self = this;

        group.onclick = (e) => {
            const id = self.data.id;
            if (!self._meshlog.visible_contacts.hasOwnProperty(id)) {
                self.highlight = true;
                self._meshlog.visible_contacts[id] = 1;
                self.dom.details.hidden = false;
            } else {
                self.highlight = false;
                self.dom.details.hidden = true;
                delete self._meshlog.visible_contacts[id];
            }
            self.updateDom();
            self._meshlog.update();
        }

        group.onmouseover = (e) => {
            // Highligt messages
            // Draw adv travels
            
            Object.entries(this.messages).forEach(([k,msg]) => {
                msg.highlight = true;
                msg.updateDom();
            });

            this.showNeighbors();
            this._meshlog.visible_markers = [
                this.marker
            ];
            this._meshlog.fadeMarkers();
        }

        group.onmouseleave = (e) => {
            Object.entries(this.messages).forEach(([k,msg]) => {
                msg.highlight = false;
                msg.update();
            });

            this.hideNeighbors();
            this._meshlog.visible_markers = [];
            this._meshlog.fadeMarkers();
        }

        this.dom = {
            container,
            name,
            date,
            hash,
            icon,
            details,
            type,
            pubkey
        };

        if (root) root.appendChild(container);

        return container;
    }

    addToMap(map) {
        if (this.marker) return;
        this.map = map;

        if (!this.adv || (this.adv.data.lat == 0 && this.adv.data.lon == 0)) {
            return
        }

        let iconUrl = 'assets/img/tower.svg';
        let kl = 'marker-pin';
        let receipt = false;

        if (this.isClient()) {
            const rep = this.isReporter();
            if (rep) {
                receipt = rep.data.color;
            } else {
                iconUrl = 'assets/img/person.svg';
            }
        } else if (this.isRepeater()) {
            iconUrl = 'assets/img/tower.svg';
        } else if (this.isRoom()) {
            iconUrl = 'assets/img/group.svg';
        } else {
            iconUrl = 'assets/img/unknown.svg';
        }

        const extractEmoji = (str) => {
            const emojiRegex = /\p{Extended_Pictographic}/u;
            const match = str.match(emojiRegex);
            return match ? match[0] : '';
        }

        let innerIcon;
        let emoji = extractEmoji(this.adv.data.name);
        if (emoji) {
            innerIcon = document.createElement('span');
            innerIcon.innerText = emoji;
        } else if (receipt) {
            const hw = '20px';
            innerIcon = document.createElement('span');
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('height', hw);
            svg.setAttribute('viewBox', '0 -960 960 960');
            svg.setAttribute('width', hw);
            svg.setAttribute('fill', this._meshlog.sanitizeColor(receipt));
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', 'M240-80q-50 0-85-35t-35-85v-120h120v-560l60 60 60-60 60 60 60-60 60 60 60-60 60 60 60-60 60 60 60-60v680q0 50-35 85t-85 35H240Zm480-80q17 0 28.5-11.5T760-200v-560H320v440h360v120q0 17 11.5 28.5T720-160ZM360-600v-80h240v80H360Zm0 120v-80h240v80H360Zm320-120q-17 0-28.5-11.5T640-640q0-17 11.5-28.5T680-680q17 0 28.5 11.5T720-640q0 17-11.5 28.5T680-600Zm0 120q-17 0-28.5-11.5T640-520q0-17 11.5-28.5T680-560q17 0 28.5 11.5T720-520q0 17-11.5 28.5T680-480ZM240-160h360v-80H200v40q0 17 11.5 28.5T240-160Zm-40 0v-80 80Z');
            svg.appendChild(path);
            innerIcon.appendChild(svg);
        } else {
            innerIcon = document.createElement('img');
            innerIcon.src = iconUrl;
        }

        let icdivroot = document.createElement("div");
        let icdivch1 = document.createElement("div");
        icdivch1.classList.add(kl);
        icdivroot.appendChild(icdivch1);
        icdivroot.appendChild(innerIcon);

        innerIcon.classList.add('marker-icon-img');

        if (!this.isClient()) {
            if (this.adv.isVeryExpired()) {
                icdivch1.classList.add("missing");
            } else if (this.adv.isExpired()) {
                icdivch1.classList.add("ghosted");
            }
        }

        let icon = L.divIcon({
            className: 'custom-div-icon',
            html: icdivroot,
            iconSize: [30, 42],
            iconAnchor: [15, 42]
        });

        const self = this;

        const sanitizedName = this._meshlog.sanitizeText(this.adv.data.name);
        const sanitizedDate = this._meshlog.sanitizeText(this.adv.data.sent_at);
        let tooltip = `<p class="tooltip-title">${sanitizedName}</p><p class="tooltip-detail">Last adv: ${sanitizedDate}</p>`;

        this.marker = L.marker([this.adv.data.lat, this.adv.data.lon], { icon: icon }).addTo(map);
        this.marker.bindTooltip(tooltip);
        this.marker.on('mouseover', (e) => {
            self.highlight = 'yellow';
            this.updateDom();
        });
        this.marker.on('mouseout', (e) => {
            self.highlight = '';
            this.updateDom();
        });
    }

    updateDom() {
        if (!this.dom) return;
        if (!this.adv) return;

        let hashstr = this.data.public_key.substr(0,2);

        if (this.adv.isExpired()) { // 3 days
            this.dom.date.classList.add("prio-6");
        } else {
            this.dom.date.classList.remove("prio-6");
        }

        if (this.flags.dupe) {
            this.dom.hash.classList.add("prio-5");
        } else {
            this.dom.hash.classList.remove("prio-5");
        }

        this.dom.pubkey.innerText = `Public Key: ${this._meshlog.sanitizeText(this.data.public_key)}`;

        if (this.adv.data.type == 1) {
            this.dom.icon.src = "assets/img/person.svg";
            this.dom.type.innerText = `Type: Chat`;
        } else if (this.adv.data.type == 2) {
            this.dom.icon.src = "assets/img/tower.svg";
            this.dom.type.innerText = `Type: Repeater`;
        } else if (this.adv.data.type == 3) {
            this.dom.icon.src = "assets/img/group.svg";
            this.dom.type.innerText = `Type: Room`;
        } else {
            this.dom.type.innerText = `Type: Unknown`;
            this.dom.icon.src = "assets/img/unknown.svg";
        }

        this.dom.name.innerText = this._meshlog.sanitizeText(this.adv.data.name);
        this.dom.date.innerText = this._meshlog.sanitizeText(this.adv.data.sent_at);
        this.dom.hash.innerText = `[${this._meshlog.validateHash(hashstr)}]`;

        const removeEmojis = (str) => {
            return str.replace(
                /([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDD00-\uDFFF])/g,
                ''
            );
        };

        if (this.highlight) {
            this.dom.name.classList.add("chighlight");
        } else {
            this.dom.name.classList.remove("chighlight");
        }

        this.dom.container.dataset.time = this.adv.time;
        this.dom.container.dataset.name = this._meshlog.sanitizeText(removeEmojis(this.adv.data.name).trim());
        this.dom.container.dataset.hash = this._meshlog.validateHash(hashstr);
    }

    updateMarker() {
        if (!this.marker) return;
    }

    update() {
        this.updateDom();
        this.updateMarker();
    }

    isClient() {
        return this.adv && this.adv.data.type == 1;
    }

    isRepeater() {
        return this.adv && this.adv.data.type == 2;
    }

    isRoom() {
        return this.adv && this.adv.data.type == 3;
    }

    isReporter() {
        return this._meshlog.isReporter(this.data.public_key);
    }

    pathTag() { return 'c'; }
}

class MeshLogGroupChild extends MeshLogObject {
    createDom(root) {
        if (this.dom) return this.dom.container;

        let container = document.createElement("div");
        container.classList.add("log-entry");
        container.style.marginLeft = '4px';

        let date = document.createElement("span");
        date.classList.add("sp");
        date.classList.add("c");

        let text = document.createElement("span");
        text.classList.add("sp");

        let dot = document.createElement("span");
        dot.classList.add('dot');

        let reporter = this._meshlog.reporters[this.data.reporter_id];
        if (reporter) {
            dot.style.background = reporter.data.color;
        }

        container.appendChild(date);
        container.appendChild(dot);
        container.appendChild(text);

        const pathId = `${this.pathTag()}_${this.data.id}`;

        const self = this;
        container.onmouseover = (e) => {
            // show path
            if (self.parent.dom.pin.checked) return;
            let src = self._meshlog.contacts[self.data.contact_id];
            let dst = self._meshlog.reporters[self.data.reporter_id];
            self._meshlog.showPath(pathId, self.data.path, src, dst, this.color);
        }

        container.onmouseout = (e) => {
            // hide path
            if (self.parent.dom.pin.checked) return;
            self._meshlog.hidePath(pathId, self.data.id);
        }

        root.appendChild(container);
        
        this.dom = {
            container,
            date,
            text
        };
        
        return container;
    }

    updateDom() {
        if (!this.dom) return;
        this.dom.date.innerText = this._meshlog.sanitizeText(this.data.sent_at);
        this.dom.text.innerText = this.data.path ? this._meshlog.sanitizeText(this.data.path) : 'direct';
    }

    pathTag() { return '?'; }
}

class MeshLogChannelMessage extends MeshLogGroupChild {
    pathTag() { return 'g'; }
}
class MeshLogDirecMessage extends MeshLogGroupChild {
    pathTag() { return 'd'; }
}
class MeshLogAdvertisement extends MeshLogGroupChild {
    pathTag() { return 'a'; }

    isExpired() {
        let now = new Date();
        let seen = new Date(this.data.sent_at);

        let age = now.getTime() - seen.getTime();
        return age > (3 * 24 * 60 * 60 * 1000);
    }

    isVeryExpired() {
        let now = new Date();
        let seen = new Date(this.data.sent_at);

        let age = now.getTime() - seen.getTime();
        return age > (7 * 24 * 60 * 60 * 1000);
    }
}

class MeshLogMessageGroup extends MeshLogObject {
    constructor(meshlog, data) {
        super(meshlog, data);
        this.messages = {};
    }

    addMessage(msg) {
        const colors = [
            "#F44336",
            "#8E24AA",
            "#3949AB",
            "#00897B",
            "#43A047",
            "#EF6C00",
        ];

        msg.parent = this;
        msg.color = colors[msg.data.id % colors.length];
        this.messages[msg.data.id] = msg;

        if (this.dom && !msg.dom) { 
            msg.createDom(this.dom.child);
        }
    }

    createDom(root) {
        const msg = this.first();
        if (!msg) return undefined;

        if (this.dom) return this.dom.container;

        let container = document.createElement("div");

        let group = document.createElement("div");
        group.classList.add("log-entry");

        let date = document.createElement("span");
        date.classList.add("sp");
        date.classList.add("c");

        let translateBtn = document.createElement("button");
        translateBtn.classList.add("translate-btn");
        translateBtn.innerText = "T";
        translateBtn.title = "Translate message";
        translateBtn.style.marginLeft = "4px";
        translateBtn.style.marginRight = "12px";
        translateBtn.setAttribute("data-state", "translate");

        let message = document.createElement("div");

        let name = document.createElement("span");
        name.classList.add("sp");
        name.classList.add("t");

        let text = document.createElement("span");
        text.classList.add("sp");

        let right = document.createElement("span");
        right.style.marginLeft= 'auto';
        right.style.whiteSpace = 'nowrap';

        let count = document.createElement("span");
        count.classList.add("sp");

        let pin = document.createElement("input");
        pin.type = 'checkbox';
        right.appendChild(pin);

        pin.onclick = (e) => {
            e.stopPropagation();
        }

        translateBtn.onclick = (e) => {
            e.stopPropagation();
            this.translateMessage();
        }

        let child = document.createElement("div");
        child.style.borderLeft = "solid 2px #888";
        child.style.marginLeft = "2px";
        child.hidden = true;

        Object.entries(this.messages).forEach(([k,v]) => {
            v.createDom(child);
        });

        message.appendChild(name);
        message.appendChild(text);

        group.appendChild(date);
        group.appendChild(translateBtn);
        group.appendChild(message);
        group.appendChild(right);
        container.appendChild(group);
        container.appendChild(child);

        this.dom = {
            container,
            group,
            name,
            date,
            text,
            right,
            count,
            translateBtn,
            pin,
            child
        };

        // Store original message text and translation state
        this.originalText = null;
        this.translatedText = null;
        this.isTranslated = false;
        
        // Load translation state from localStorage
        this.loadTranslationState();

        group.onclick = (e) => {
            child.hidden = !child.hidden;
        }

        group.onmouseover = (e) => {
            Object.entries(this.messages).forEach(([k,v]) => {
                v.dom.container.onmouseover(e);
            });
        }

        group.onmouseout = (e) => {
            Object.entries(this.messages).forEach(([k,v]) => {
                if (!pin.checked) {
                    v.dom.container.onmouseout(e);
                }
            });
        }

        let ins = false;
        container.dataset.time = msg.time;
        // augšā lielāks ID
        if (root) {
            var children = root.children;
            for (let i=0;i<children.length;i++) {
                let c = root.children[i];
                if (c.dataset.time < msg.time) {
                    root.insertBefore(container, c);
                    ins = true;
                    break;
                }
            }

            if (!ins) root.appendChild(container);
        }

        return container;
    }

    first() {
        const k = Object.keys(this.messages)[0];
        return this.messages[k];
    }

    size() {
        return Object.keys(this.messages).length;
    }

    updateDom() {
        let msg = this.first();
        if (!msg) return;

        // Display timestamp as-is (server is already in CEST/UTC+2)
        this.dom.date.innerText = this._meshlog.sanitizeText(msg.data.sent_at);
        
        // Add channel name prefix for channel messages
        let displayName = this._meshlog.sanitizeText(msg.data.name);
        if (msg instanceof MeshLogChannelMessage) {
            // Map channel_id to channel name
            if (msg.data.channel_id === 1) {
                displayName = "(Public) " + displayName;
            } else if (msg.data.channel_id === 2) {
                displayName = "(Hungary) " + displayName;
            } else if (msg.data.channel_id === 3) {
                displayName = "(#hungary) " + displayName;
            } else if (msg.data.channel_id === 4) {
                displayName = "(#ping) " + displayName;
            }
        }
        this.dom.name.innerText = displayName + ": ";

        const sz = this.size();
        this.dom.count.innerText = `×${sz}`;

        let hidden = false;

        if (msg instanceof MeshLogAdvertisement) {
            this.dom.text.innerText = "Advert";
            this.dom.text.style.color = 'gray';
            hidden = !this._meshlog.settings.types.advertisements;
        } else if (msg instanceof MeshLogChannelMessage) {
            // Preserve translation state during auto-refresh
            if (!this.isTranslated) {
                this.dom.text.innerHTML = this._meshlog.sanitizeMessage(msg.data.message);
            }
            this.dom.name.style.color = '#d87dff'
            this.dom.text.style.color = 'white';
            hidden = !this._meshlog.settings.types.channel_messages;
        } else if (msg instanceof MeshLogDirecMessage) {
            // Preserve translation state during auto-refresh
            if (!this.isTranslated) {
                this.dom.text.innerHTML = this._meshlog.sanitizeMessage(msg.data.message);
            }
            this.dom.text.style.color = 'white';
            hidden = !this._meshlog.settings.types.direct_messages;
        } else {
            console.log("unkn instance");
            // ????
        }

        let allvis = Object.keys(this._meshlog.visible_contacts).length < 1;
        if (allvis || this._meshlog.visible_contacts.hasOwnProperty(msg.data.contact_id)) {
            this.dom.container.hidden = hidden | false;
        } else {
            this.dom.container.hidden = true;
        }

        if (this.highlight) {
            this.dom.group.classList.add("highlight");
        } else {
            this.dom.group.classList.remove("highlight");
        }

        Object.entries(this.messages).forEach(([k,v]) => {
            v.updateDom();
        })
    }

    async translateMessage() {
        const msg = this.first();
        if (!msg || !msg.data.message) {
            return;
        }

        const translateBtn = this.dom.translateBtn;
        
        // Store original text if not already stored
        if (!this.originalText) {
            this.originalText = this.dom.text.innerText;
        }

        // If already translated, toggle back to original
        if (this.isTranslated) {
            this.dom.text.innerText = this.originalText;
            this.isTranslated = false;
            translateBtn.innerText = "T";
            translateBtn.title = "Translate message";
            translateBtn.setAttribute("data-state", "translate");
            translateBtn.disabled = false;
            this.saveTranslationState();
            return;
        }

        // Show loading state
        translateBtn.innerText = "...";
        translateBtn.disabled = true;

        try {
            const translation = await this._meshlog.translateText(msg.data.message);
            
            if (translation) {
                // Store translation and update display
                this.translatedText = translation;
                this.dom.text.innerText = translation;
                this.isTranslated = true;
                
                // Change button to show it's translated
                translateBtn.innerText = "O";
                translateBtn.title = "Show original";
                translateBtn.setAttribute("data-state", "original");
                translateBtn.disabled = false;
                this.saveTranslationState();
            } else {
                translateBtn.innerText = "!";
                translateBtn.title = "Translation failed";
                translateBtn.disabled = false;
            }
        } catch (error) {
            console.error('Translation error:', error);
            translateBtn.innerText = "!";
            translateBtn.title = "Translation error";
            translateBtn.disabled = false;
        }
    }

    loadTranslationState() {
        const msg = this.first();
        if (!msg || !msg.data.message) return;

        // Create a unique key for this message
        const messageKey = `translation_${msg.data.id}_${msg.data.hash}`;
        
        try {
            const savedState = localStorage.getItem(messageKey);
            if (savedState) {
                const state = JSON.parse(savedState);
                if (state.isTranslated && state.translatedText) {
                    this.originalText = state.originalText;
                    this.translatedText = state.translatedText;
                    this.isTranslated = true;
                    
                    // Update the display
                    this.dom.text.innerText = state.translatedText;
                    this.dom.translateBtn.innerText = "O";
                    this.dom.translateBtn.title = "Show original";
                    this.dom.translateBtn.setAttribute("data-state", "original");
                }
            }
        } catch (error) {
            console.warn('Failed to load translation state:', error);
        }
    }

    saveTranslationState() {
        const msg = this.first();
        if (!msg || !msg.data.message) return;

        // Create a unique key for this message
        const messageKey = `translation_${msg.data.id}_${msg.data.hash}`;
        
        try {
            const state = {
                isTranslated: this.isTranslated,
                originalText: this.originalText,
                translatedText: this.translatedText
            };
            localStorage.setItem(messageKey, JSON.stringify(state));
        } catch (error) {
            console.warn('Failed to save translation state:', error);
        }
    }
}

class MeshLog {
    constructor(map, logsid, contactsid, stypesid, sreportersid, scontactsid) {
        this.reporters = {};
        this.contacts = {};
        this.advertisements = {};
        this.channels = {};
        this.channel_messages = {};
        this.direct_messages = {};

        this.messages = {};

        this.map = map;
        this.map_layers = {};
        this.visible_markers = [];
        this.visible_contacts = {};
        this.link_pairs = {};
        this.dom_logs = document.getElementById(logsid);
        this.dom_contacts = document.getElementById(contactsid);
        this.timer = false;
        this.autorefresh = 0;

        // epoch of newest object
        this.latest = 0;
        this.window_active = true;
        this.new_messages = {};

        const self = this;

        window.onfocus = function () {
            self.window_active = true;
            self.clearNotifications();
        };

         
         window.onblur = function () {
            self.window_active = false;
         };
         

        // Settings objects
        this.settings = {
            types: {
                advertisements: true,
                channel_messages: true,
                direct_messages: false,
            },
            reporters: {

            },
            contacts: {

            },
            translation: {
                enabled: true,
                fromLang: 'sk',
                toLang: 'hu',
                cache: {} // Cache translations to avoid repeated API calls
            }
        }

        this.dom_settings_types = document.getElementById(stypesid);
        this.dom_settings_reporters = document.getElementById(sreportersid);
        this.dom_settings_contacts = document.getElementById(scontactsid);

        this.__init_types();
        this.__init_order();
        this.__init_translation();

        this.last = '2025-01-01 00:00:00';
    }

    sanitizeText(text) {
        if (typeof text !== 'string') return '';
        return text.replace(/[<>&"']/g, (match) => {
            const escapeMap = {
                '<': '&lt;',
                '>': '&gt;',
                '&': '&amp;',
                '"': '&quot;',
                "'": '&#x27;'
            };
            return escapeMap[match];
        });
    }

    sanitizeMessage(text) {
        if (typeof text !== 'string') return '';
        // Only escape the most dangerous characters for XSS in content
        return text.replace(/[<>&]/g, (match) => {
            const escapeMap = {
                '<': '&lt;',
                '>': '&gt;',
                '&': '&amp;'
            };
            return escapeMap[match];
        });
    }

    sanitizeColor(color) {
        if (typeof color !== 'string') return '#000000';
        if (/^#[0-9A-Fa-f]{6}$/.test(color)) return color;
        if (/^#[0-9A-Fa-f]{3}$/.test(color)) return color;
        return '#000000';
    }


    validateHash(hash) {
        if (typeof hash !== 'string') return '00';
        return /^[0-9a-fA-F]{2}$/.test(hash) ? hash : '00';
    }

    __createCb(label, img, checked, onchange) {
        let div = document.createElement("div");
        let cb = document.createElement("input");
        let lbl = document.createElement("label");
        let ico = document.createElement("img");

        cb.type = "checkbox";
        cb.checked = checked;
        cb.onchange = onchange;

        lbl.innerText = label;

        if (img) {
            ico.src = img;
            ico.classList.add('icon-16');
            lbl.prepend(ico);
        }

        lbl.insertBefore(cb, lbl.firstChild);

        div.classList.add("settings-cb");
        div.appendChild(lbl);

        return div;
    }

    __onTypesChanged() {
        console.log(this.settings.types);
        this.update();
    }

    __onReportersChanged() {
        console.log(this.reporters);
        //this.updateReporters();
    }

    sortContacts(fn=undefined, reverse=false) {
        if (!fn) {
            fn = this.order.fn;
            reverse = this.order.reverse;
        }

        const items = Array.from(this.dom_contacts.children);
        items.sort(fn);
        if (reverse) items.reverse();
        items.forEach(item => this.dom_contacts.appendChild(item));
    }

    __init_order() {
        let orders = [
            {
                name: 'Last Advert',
                fn: (a, b) => { 
                    return (Number(b.dataset.time) - Number(a.dataset.time));
                }
            },
            {
                name: 'Hash',
                fn: (a, b) => { 
                    const hashA = this.validateHash(a.dataset.hash);
                    const hashB = this.validateHash(b.dataset.hash);
                    return parseInt(`0x${hashA}`) - parseInt(`0x${hashB}`);
                }
            },
            {
                name: 'Name',
                fn: (a, b) => { 
                    return a.dataset.name.localeCompare(b.dataset.name);
                },
            },
        ];

        this.order = {
            fn: orders[0].fn,
            reverse: false,
            buttons: []
        };

        let container = document.createElement('div');
        let text = document.createElement('span');
        container.append(text);

        const self = this;
        for (let i=0;i<orders.length;i++) {
            let btn = document.createElement('button');
            btn.classList.add('btn');
            btn.innerText = orders[i].name;

            if (i == 0) {
                btn.classList.add('active');
            }

            btn.onclick = (e) => {
                for (const b of self.order.buttons) {
                    b.classList.remove('active');
                    b.classList.remove('reverse');
                }

                btn.classList.add('active');

                if (self.order.fn == orders[i].fn) {
                    self.order.reverse = !self.order.reverse;
                    if (self.order.reverse) {
                        btn.classList.add('reverse');
                    }
                } else {
                    self.order.fn = orders[i].fn;
                    self.order.reverse = false;
                }
                self.sortContacts();
            }
            this.order.buttons.push(btn);
            container.appendChild(btn);
        }

        // Add Collision Helper button
        let collisionBtn = document.createElement('button');
        collisionBtn.classList.add('btn', 'collision-helper-btn');
        collisionBtn.innerText = 'Collision Helper';
        collisionBtn.onclick = (e) => {
            this.showCollisionHelper();
        };
        container.appendChild(collisionBtn);

        this.dom_settings_contacts.appendChild(container);
    }

    __init_types() {
        const self = this;
        this.dom_settings_types.appendChild(
            this.__createCb(
                "Advertisements",
                "assets/img/beacon.png",
                this.settings.types.advertisements,
                (e) => {
                    this.settings.types.advertisements = e.target.checked;
                    self.__onTypesChanged(e);
                }
            )
        );

        this.dom_settings_types.appendChild(
            this.__createCb(
                "Channel Messages",
                "assets/img/message.png",
                this.settings.types.channel_messages,
                (e) => {
                    this.settings.types.channel_messages = e.target.checked;
                    self.__onTypesChanged(e);
                }
            )
        );

        this.dom_settings_types.append(
            this.__createCb(
                "Direct Messages to Bot",
                "assets/img/message.png",
                this.settings.types.direct_messages,
                (e) => {
                    this.settings.types.direct_messages = e.target.checked;
                    self.__onTypesChanged(e);
                }
            )
        );

        // Add radius slider

        // Goat icon removed - was non-functional notification toggle
        // this.settings.notifications = false;
        // this.dom_settings_types.append(
        //     this.__createCb(
        //         "🐐",
        //         "",
        //         this.settings.notifications,
        //         (e) => {
        //             this.settings.notifications = e.target.checked;
        //         }
        //     )
        // );
    }

    __init_reporters() {
        Object.entries(this.reporters).forEach(([id,_]) => {
            let reporter = this.reporters[id];
            if (reporter.hasOwnProperty('dom')) {
                return;
            }
            const self = this;
            this.reporters[id].enabled = true;
            this.dom_settings_reporters.hidden = true;
            // this.reporters[id].dom = this.dom_settings_reporters.appendChild(
            //     this.__createCb(
            //         this.reporters[id].data.name,
            //         false,
            //         this.reporters[id].enabled,
            //         (e) => {
            //             self.reporters[id].enabled = e.target.checked;
            //             self.__onReportersChanged(e)
            //         }
            //     )
            // );
        });
    }

    __init_contacts() {
        // Add sorters:
        //   By Date
        //   By Name
        // Add Display settings:
        //   Show names
        // Add some filters?
    }

    __addObject(dataset, id, obj) {
        if (dataset.hasOwnProperty(id)) {
            dataset[id].merge(obj.data);
        } else {
            dataset[id] = obj;
        }
    }

    __formatedTimestamp(d=new Date()) {
        const date = d.toISOString().split('T')[0];
        const time = d.toTimeString().split(' ')[0];
        return `${date} ${time}`
    }

    __prepareQuery(params={}) {
        let query = {};
        // bax date
        if (params.hasOwnProperty('after_ms')) {
            query.after_ms = params['after_ms'];
        }
        // min date
        if (params.hasOwnProperty('before_ms')) {
            query.before_ms = params['before_ms'];
        }

        // max count
        if (params.hasOwnProperty('count')) {
            query.before = params['count'];
        }

        // reporter ids
        if (params.hasOwnProperty('reporters')) {
            query.reporters = params['reporters'];
        }

        return query;
    }

    __fetchQuery(params, url, onResponse) {
        const query = this.__prepareQuery(params);
        const urlparams = new URLSearchParams();

        for (const key in query) {
            if (query.hasOwnProperty(key)) {
                const value = query[key];
                if (Array.isArray(value)) {
                    // For arrays, append each item with same key
                    value.forEach(item => urlparams.append(key, item));
                } else if (value !== undefined && value !== null) {
                    urlparams.append(key, value);
                }
            }
        }

        fetch(`${url}?${urlparams.toString()}`)
            .then(response => response.json())
            .then(data => onResponse(data));
    }

    showError(err) {
        alert(err);
    }

    __loadObjects(dataset, data, klass) {
        if (data.error) {
            this.showError(data.error);
            return 0;
        }

        for (let i=0;i<data.objects.length;i++) {
            const o = data.objects[i];
            const id = o.id;
            const obj = new klass(this, o);
            this.__addObject(dataset, id, obj);

            if (o.created_at) {
                let created_at = new Date(o.created_at).getTime();
                if (created_at != 0) {
                    if (created_at > this.latest) {
                        this.latest = created_at;
                    }
                }
            }
        }

        return data.objects;
    }

    loadNew(onload=null) {
        let params = { 
            "after_ms": this.latest
        };
        this.loadAll(params, onload);
    }

    loadOld(onload=null) {
        const self = this;
        let oldest_adv = this.latest;
        let oldest_grp = this.latest;
        let oldest_dm  = this.latest;

        Object.entries(this.advertisements).forEach(([k,v]) => {
            let created_at = new Date(v.data.created_at).getTime();
            oldest_adv = Math.min(oldest_adv, created_at);
        });

        Object.entries(this.channel_messages).forEach(([k,v]) => {
            let created_at = new Date(v.data.created_at).getTime();
            oldest_grp = Math.min(oldest_grp, created_at);
        });

        Object.entries(this.direct_messages).forEach(([k,v]) => {
            let created_at = new Date(v.data.created_at).getTime();
            oldest_dm = Math.min(oldest_dm, created_at);
        });

        this.__fetchQuery({ "before_ms": oldest_adv }, 'api/v1/advertisements', data => {
            const rep = self.__loadObjects(self.advertisements, data, MeshLogAdvertisement);
            if (rep.length) console.log(`${rep.length} advertisements loaded`);
            self.onLoadAll();
            if (onload) onload();
        });

        this.__fetchQuery({ "before_ms": oldest_grp }, 'api/v1/channel_messages', data => {
            const rep = self.__loadObjects(self.channel_messages, data, MeshLogChannelMessage);
            if (rep.length) console.log(`${rep.length} group messages loaded`);
            self.onLoadAll();
            if (onload) onload();
        });

        this.__fetchQuery({ "before_ms": oldest_dm }, 'api/v1/direct_messages', data => {
            const rep = self.__loadObjects(self.direct_messages, data, MeshLogDirecMessage);
            if (rep.length) console.log(`${rep.length} direct messages loaded`);
            self.onLoadAll();
            if (onload) onload();
        });
    }


    loadAll(params={}, onload=null) {
        this.__fetchQuery(params, 'api/v1/all', data => {
            const rep1 = this.__loadObjects(this.reporters, data.reporters, MeshLogReporter);
            const rep2 = this.__loadObjects(this.contacts, data.contacts, MeshLogContact);
            const rep4 = this.__loadObjects(this.channels, data.channels, MeshLogChannel);

            const rep3 = this.__loadObjects(this.advertisements, data.advertisements, MeshLogAdvertisement);
            const rep5 = this.__loadObjects(this.channel_messages, data.channel_messages, MeshLogChannelMessage);
            const rep6 = this.__loadObjects(this.direct_messages, data.direct_messages, MeshLogDirecMessage);

            if (rep1.length) console.log(`${rep1.length} reporters loaded`);
            if (rep2.length) console.log(`${rep2.length} contacts loaded`);
            if (rep3.length) console.log(`${rep3.length} advertisements loaded`);
            if (rep4.length) console.log(`${rep4.length} groups loaded`);
            if (rep5.length) console.log(`${rep5.length} group messages loaded`);
            if (rep6.length) console.log(`${rep6.length} direct messages loaded`);

            this.__init_reporters();
            this.onLoadAll();

            if (onload) {
                onload({
                    reporters: rep1,
                    contacts: rep2,
                    groups: rep4,
                    advertisements: rep3,
                    channel_messages: rep5,
                    direct_messages: rep6,
                });
            }
        });
    }

    onLoadContacts() {
        let hashes = {};
        Object.entries(this.contacts).forEach(([id,contact]) => {
            let adv = Object.values(this.advertisements).reverse().find(item => item.data.contact_id == id);

            if (!adv && contact.data.advertisement) {
                adv = new MeshLogAdvertisement(this, contact.data.advertisement);
            }
            
            if (!adv) return;

            contact.adv = adv;

            let hashstr = contact.data.public_key.substr(0,2);

            // Mark dupes - only include repeaters (type 2) in collision detection
            const isRepeater = contact.adv && contact.adv.data.type == 2;
            
            if (isRepeater) {
                if (hashes.hasOwnProperty(hashstr)) {
                    for (let i=0;i<hashes[hashstr].length;i++) {
                        hashes[hashstr][i].flags.dupe = true;
                        hashes[hashstr][i].updateDom();
                    }
                    contact.flags.dupe = true;
                } else {
                    hashes[hashstr] = [];
                }
                hashes[hashstr].push(contact);
            }

            contact.createDom(this.dom_contacts);
            contact.addToMap(this.map);
            contact.update();
        });
        this.sortContacts();
    }

    showCollisionHelper() {
        // Create modal overlay
        let modal = document.createElement('div');
        modal.classList.add('collision-helper-modal');
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        };

        // Create modal content
        let modalContent = document.createElement('div');
        modalContent.classList.add('collision-helper-content');
        modalContent.onclick = (e) => e.stopPropagation();

        // Create header
        let header = document.createElement('div');
        header.classList.add('collision-helper-header');
        header.innerHTML = '<h3>Collision Helper</h3><button class="close-btn">&times;</button>';
        header.querySelector('.close-btn').onclick = () => modal.remove();

        // Create table container
        let tableContainer = document.createElement('div');
        tableContainer.classList.add('collision-helper-table');

        // Generate collision data using existing logic
        let hashes = {};
        let repeaterContacts = {};

        // Build the same collision detection as in onLoadContacts
        Object.entries(this.contacts).forEach(([id, contact]) => {
            let adv = Object.values(this.advertisements).reverse().find(item => item.data.contact_id == id);
            if (!adv && contact.data.advertisement) {
                adv = new MeshLogAdvertisement(this, contact.data.advertisement);
            }
            if (!adv) return;

            let hashstr = contact.data.public_key.substr(0, 2).toLowerCase();
            const isRepeater = adv && adv.data.type == 2;
            
            if (isRepeater) {
                repeaterContacts[hashstr] = repeaterContacts[hashstr] || [];
                repeaterContacts[hashstr].push({
                    name: adv.data.name || 'Unknown',
                    contact: contact
                });

                if (hashes.hasOwnProperty(hashstr)) {
                    hashes[hashstr].forEach(c => c.flags.dupe = true);
                    contact.flags.dupe = true;
                } else {
                    hashes[hashstr] = [];
                }
                hashes[hashstr].push(contact);
            }
        });

        // Generate hex ID grid (01 to FE)
        let grid = document.createElement('div');
        grid.classList.add('hex-grid');

        for (let i = 1; i <= 254; i++) { // 01 to FE (254 entries)
            let hexId = i.toString(16).padStart(2, '0').toUpperCase();
            let cell = document.createElement('div');
            cell.classList.add('hex-cell');
            cell.textContent = hexId;

            // Determine status and color
            if (repeaterContacts.hasOwnProperty(hexId.toLowerCase())) {
                let contacts = repeaterContacts[hexId.toLowerCase()];
                if (contacts.length > 1) {
                    // Colliding - multiple repeaters with same ID
                    cell.classList.add('colliding');
                    cell.title = `Colliding IDs:\n${contacts.map(c => c.name).join('\n')}`;
                } else {
                    // Occupied - single repeater
                    cell.classList.add('occupied');
                    cell.title = `Occupied by: ${contacts[0].name}`;
                }
            } else {
                // Unoccupied
                cell.classList.add('unoccupied');
                cell.title = 'Unoccupied';
            }

            grid.appendChild(cell);
        }

        tableContainer.appendChild(grid);
        modalContent.appendChild(header);
        modalContent.appendChild(tableContainer);
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
    }

    addMessage(msg) {
        // identified by date + hash
        const hash = msg.data.hash;
        if (!this.messages.hasOwnProperty(hash)) {
            this.onNewMessage(msg);
            this.messages[hash] = new MeshLogMessageGroup(this, {
                sent_at: msg.data.sent_at,
                created_at: msg.data.created_at, // this will be different for each message, but it helps for
            });
        }
        this.messages[hash].addMessage(msg);

        let contact = this.contacts[msg.data.contact_id];
        if (contact) this.contacts[msg.data.contact_id].addMessage(this.messages[hash]);
    }

    findContactByHash(hash) {
        let pk = hash.length > 4;
        for (const [_, contact] of Object.entries(this.contacts)) {
            if (pk && contact.data.public_key == hash) {
                return contact;
            } else if (contact.hash == hash) {
                return contact;
            }
        }
        return undefined;
    }

    update() {
        for (const [key, msg] of Object.entries(this.messages)) {
            msg.createDom(this.dom_logs);
            msg.update();
        }
    }

    onLoadMessages() {
        Object.entries(this.advertisements).forEach(([id,_]) => { this.addMessage(this.advertisements[id]); });
        Object.entries(this.channel_messages).forEach(([id,_]) => { this.addMessage(this.channel_messages[id]); });
        Object.entries(this.direct_messages).forEach(([id,_]) => { this.addMessage(this.direct_messages[id]); });

        this.update();
    }

    onLoadAll() {
        this.onLoadContacts();
        this.onLoadMessages();
    }

    loadReporters(params={}, onload=null) {
        this.__fetchQuery(params, 'api/v1/reporters', data => {
            const sz = this.__loadObjects(this.reporters, data, MeshLogObject);
            console.log(`${sz} reporters loaded`);
            if (onload) onload();
        });
    }

    loadContacts(params={}, onload=null) {
        this.__fetchQuery(params, 'api/v1/contacts', data => {
            const sz = this.__loadObjects(this.contacts, data, MeshLogContact);
            console.log(`${sz} contacts loaded`);
            if (onload) onload();
        });
    }

    loadAdvertisements(params={}, onload=null) {
        this.__fetchQuery(params, 'api/v1/advertisements', data => {
            const sz = this.__loadObjects(this.advertisements, data, MeshLogAdvertisement);
            console.log(`${sz} advertisements loaded`);
            if (onload) onload();
        });
    }

    loadChannels(params={}, onload=null) {
        this.__fetchQuery(params, 'api/v1/channels', data => {
            const sz = this.__loadObjects(this.channels, data, MeshLogObject);
            console.log(`${sz} channels loaded`);
            if (onload) onload();
        });
    }

    loadChannelMessages(params={}, onload=null) {
        this.__fetchQuery(params, 'api/v1/channel_messages', data => {
            const sz = this.__loadObjects(this.channel_messages, data, MeshLogChannelMessage);
            console.log(`${sz} channels messages loaded`);
            if (onload) onload();
        });
    }

    loadDirectMessages(params={}, onload=null) {
        this.__fetchQuery(params, 'api/v1/direct_messages', data => {
            const sz = this.__loadObjects(this.direct_messages, data, MeshLogDirecMessage);
            console.log(`${sz} direct messages loaded`);
            if (onload) onload();
        });
    }

    fadeMarkers(opacity=0.2) {
        const empty = this.visible_markers.length == 0; 
        Object.entries(this.contacts).forEach(([k,v]) => {
            if (!v.marker) return;
            if (empty || this.visible_markers.includes(v.marker)) {
                v.marker.setOpacity(1);
                v.marker.setZIndexOffset(1000);
            } else {
                v.marker.setOpacity(opacity);
                v.marker.setZIndexOffset(2);
            }
        });
    }

    validatePath(hashes, src) {
        const pathNodes = [];
        const contacts = this.contacts;
        
        for (let i = 0; i < hashes.length; i++) {
            const candidates = [];
            const hash = hashes[i];
            
            for (const v of Object.values(contacts)) {
                if (v.hash === hash && v.adv && !v.adv.isExpired() && v.isRepeater()) {
                    candidates.push(v);
                }
            }
            
            if (candidates.length === 0) continue;
            
            let selectedNode = null;
            
            if (candidates.length === 1) {
                selectedNode = candidates[0];
            } else {
                if (i === 0) {
                    // First hop selection
                    if (src?.adv?.data?.lat && src?.adv?.data?.lon) {
                        // Source has coordinates - select closest to source
                        let minDistance = Infinity;
                        const srcLat = src.adv.data.lat;
                        const srcLon = src.adv.data.lon;
                        
                        for (const candidate of candidates) {
                            const distance = this.calculateDistance(
                                srcLat, srcLon,
                                candidate.adv.data.lat, candidate.adv.data.lon
                            );
                            if (distance < minDistance) {
                                minDistance = distance;
                                selectedNode = candidate;
                            }
                        }
                    } else {
                        // Source has no coordinates - use context-aware selection
                        // Look ahead to the second hop to make an informed decision
                        if (hashes.length > 1) {
                            const secondHopCandidates = [];
                            const secondHash = hashes[1];
                            
                            for (const v of Object.values(contacts)) {
                                if (v.hash === secondHash && v.adv && !v.adv.isExpired() && v.isRepeater()) {
                                    secondHopCandidates.push(v);
                                }
                            }
                            
                            if (secondHopCandidates.length > 0) {
                                // For each first-hop candidate, calculate distance to second hop
                                let bestFirstHop = null;
                                let minTotalDistance = Infinity;
                                
                                for (const firstHop of candidates) {
                                    let minSecondHopDistance = Infinity;
                                    
                                    for (const secondHop of secondHopCandidates) {
                                        const distance = this.calculateDistance(
                                            firstHop.adv.data.lat, firstHop.adv.data.lon,
                                            secondHop.adv.data.lat, secondHop.adv.data.lon
                                        );
                                        if (distance < minSecondHopDistance) {
                                            minSecondHopDistance = distance;
                                        }
                                    }
                                    
                                    if (minSecondHopDistance < minTotalDistance) {
                                        minTotalDistance = minSecondHopDistance;
                                        bestFirstHop = firstHop;
                                    }
                                }
                                
                                selectedNode = bestFirstHop;
                            } else {
                                // No second hop candidates, fall back to first candidate
                                selectedNode = candidates[0];
                            }
                        } else {
                            // No second hop, fall back to first candidate
                            selectedNode = candidates[0];
                        }
                    }
                } else {
                    // Subsequent hops - always select closest to previous node
                    const previousNode = pathNodes[pathNodes.length - 1];
                    const prevLat = previousNode.adv.data.lat;
                    const prevLon = previousNode.adv.data.lon;
                    
                    let minDistance = Infinity;
                    for (const candidate of candidates) {
                        const distance = this.calculateDistance(
                            prevLat, prevLon,
                            candidate.adv.data.lat, candidate.adv.data.lon
                        );
                        if (distance < minDistance) {
                            minDistance = distance;
                            selectedNode = candidate;
                        }
                    }
                }
            }
            
            if (selectedNode) {
                pathNodes.push(selectedNode);
            }
        }
        
        return pathNodes;
    }


    calculateDistance(lat1, lon1, lat2, lon2) {
        const latDiff = lat1 - lat2;
        const lonDiff = lon1 - lon2;
        return Math.sqrt(latDiff * latDiff + lonDiff * lonDiff) * 111;
    }

    showPath(id, path, src, dst, color) {
        if (this.map_layers.hasOwnProperty(id)) return;

        const layers = [];
        const last = [];
        const hashes = path ? path.split(',') : [];
        const contacts = this.contacts;
        const visibleMarkers = this.visible_markers;
        const map = this.map;
        const linkPairs = this.link_pairs;


        for (const v of Object.values(contacts)) {
            if (v.data.public_key === dst.data.public_key && v.marker) {
                visibleMarkers.push(v.marker);
                map.removeLayer(v.marker);
                v.marker.addTo(map);
            }
        }

        if (!src || (src.adv && src.isClient()) || (src.adv && src.adv.data)) {
            // Check if client has valid coordinates and non-expired advertisement
            const hasValidClientCoords = src && src.adv && src.isClient() && 
                                       src.adv.data && src.adv.data.lat && src.adv.data.lon &&
                                       !src.adv.isExpired();
            
            if (hasValidClientCoords) {
                // Start route from client location
                last.push([src.adv.data.lat, src.adv.data.lon]);
                if (src.marker) {
                    visibleMarkers.push(src.marker);
                    map.removeLayer(src.marker);
                    src.marker.addTo(map);
                }
            } else if (src && src.adv && src.adv.data && !src.isClient()) {
                // For repeater advertisements, add the source repeater as the first hop
                last.push([src.adv.data.lat, src.adv.data.lon]);
                if (src.marker) {
                    visibleMarkers.push(src.marker);
                    map.removeLayer(src.marker);
                    src.marker.addTo(map);
                }
            }
            
            if (hashes.length > 0) {
                const pathNodes = this.validatePath(hashes, src);
                for (const node of pathNodes) {
                    last.push([node.adv.data.lat, node.adv.data.lon]);
                    if (node.marker) {
                        visibleMarkers.push(node.marker);
                        map.removeLayer(node.marker);
                        node.marker.addTo(map);
                    }
                }
            }
        }

        // Always draw circle at first hop for any path
        if (last.length > 0) {
            const firstHop = last[0];
            layers.push(L.circle(firstHop, {
                color: color,
                fillColor: color,
                fillOpacity: 0.2,
                radius: 1000
            }));
        }

        if (src && src.adv && !src.isClient() && !src.adv.data) {
            if (src.marker) {
                visibleMarkers.push(src.marker);
                map.removeLayer(src.marker);
                src.marker.addTo(map);
            }
            last.push([src.adv.data.lat, src.adv.data.lon]);
        }

        const lnWeight = 2;
        const lnOutline = 4;
        const lnOffset = 3;
        const lnMaxOffsets = 6;

        if (last.length > 0) {
            for (let i = 1; i < last.length; i++) {
                const prev = last[i-1];
                const current = last[i];
                
                const pairId = `${prev[0]}-${prev[1]}_${current[0]}-${current[1]}`;
                if (!linkPairs.hasOwnProperty(pairId)) {
                    linkPairs[pairId] = 0;
                }

                let offset = Math.floor((linkPairs[pairId] + 1) / 2) * lnOffset;
                if (offset > lnMaxOffsets) offset = 0;
                offset *= linkPairs[pairId] % 2 === 0 ? 1 : -1;

                linkPairs[pairId]++;

                layers.push(L.polyline([prev, current], {color: 'white', weight: lnOutline, offset: offset}));
                layers.push(L.polyline([prev, current], {color: color, weight: lnWeight, offset: offset}));
            }

            const lastHop = last[last.length - 1];
            const current = [dst.data.lat, dst.data.lon];
            
            const pairId = `${lastHop[0]}-${lastHop[1]}_${current[0]}-${current[1]}`;
            if (!linkPairs.hasOwnProperty(pairId)) {
                linkPairs[pairId] = 0;
            }

            let offset = Math.floor((linkPairs[pairId] + 1) / 2) * lnOffset;
            if (offset > lnMaxOffsets) offset = 0;
            offset *= linkPairs[pairId] % 2 === 0 ? 1 : -1;

            linkPairs[pairId]++;

            layers.push(L.polyline([lastHop, current], {color: 'white', weight: lnOutline, offset: offset}));
            layers.push(L.polyline([lastHop, current], {color: color, weight: lnWeight, offset: offset}));
        }

        this.map_layers[id] = L.layerGroup(layers).addTo(map);
        this.fadeMarkers();
    }

    hidePath(id) {
        if (!this.map_layers.hasOwnProperty(id)) return;
        this.map.removeLayer(this.map_layers[id]);
        delete this.map_layers[id];
        this.visible_markers = [];
        this.link_pairs = {};
        this.fadeMarkers();
    }

    clearHighlights() {
        Object.entries(this.messages).forEach(([_,grp]) => {
            grp.highlight = false;
            Object.entries(grp.messages).forEach(([_,msg]) => {
                msg.highlight = false;
            });
        });
    }

    refresh() {
        clearTimeout(this.timer);
        const self = this;
        this.loadNew((data) => {
            const count = Object.keys(this.new_messages).length;
            if (count) {
                if (this.settings.notifications) {
                    new Audio('assets/audio/notif.mp3').play();
                }

                document.getElementById('favicon').setAttribute('href','faviconr.ico');
                document.title = `(${count}) MeshCore Log`; 
            }
        });
        this.setAutorefresh(this.interval);
    }

    setAutorefresh(interval) {
        this.new_messages = {};
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }

        if (interval >= 5000) {
            this.interval = interval;
            const self = this;
            this.timer = setTimeout(() => { self.refresh(); }, interval);
        } else {
            this.interval = 0;
        }
    }

    onNewMessage(msg) {
        if (msg instanceof MeshLogChannelMessage || msg instanceof MeshLogDirecMessage) {
            const hash = msg.data.hash;
            if (!this.new_messages.hasOwnProperty(hash)) {
                this.new_messages[hash] = [];
            };
            this.new_messages[hash].push(msg);
        }
    }

    clearNotifications() {
        this.new_messages = [];
        document.getElementById('favicon').setAttribute('href','faviconw.ico');
        document.title = `MeshCore Log`; 
    }

    showAllPaths() {
        Object.entries(this.messages).forEach(([k,v]) => {
            v.dom.group.onmouseover({});
        });
    }

    isReporter(public_key) {
        for (const key in this.reporters) {
            if (this.reporters[key].data.public_key == public_key) {
                return this.reporters[key];
            }
        }
        return false;
    }

    __init_translation() {
        const self = this;
        
        // Load saved translation settings from localStorage
        this.loadTranslationSettings();
        
        // Initialize translation controls
        const fromSelect = document.getElementById('translation-from');
        const toSelect = document.getElementById('translation-to');
        const enabledCheckbox = document.getElementById('translation-enabled');

        if (fromSelect) {
            fromSelect.value = this.settings.translation.fromLang;
            fromSelect.onchange = (e) => {
                this.settings.translation.fromLang = e.target.value;
                this.saveTranslationSettings();
            };
        }

        if (toSelect) {
            toSelect.value = this.settings.translation.toLang;
            toSelect.onchange = (e) => {
                this.settings.translation.toLang = e.target.value;
                this.saveTranslationSettings();
            };
        }

        if (enabledCheckbox) {
            enabledCheckbox.checked = this.settings.translation.enabled;
            enabledCheckbox.onchange = (e) => {
                this.settings.translation.enabled = e.target.checked;
                this.saveTranslationSettings();
            };
        }

        const resetBtn = document.getElementById('reset-all-translations');
        if (resetBtn) {
            resetBtn.onclick = (e) => {
                this.resetAllTranslations();
            };
        }
    }

    async translateText(text, fromLang = null, toLang = null) {
        if (!this.settings.translation.enabled || !text || text.trim().length === 0) {
            return null;
        }

        const from = fromLang || this.settings.translation.fromLang;
        const to = toLang || this.settings.translation.toLang;

        // Check cache first
        const cacheKey = `${from}|${to}|${text}`;
        if (this.settings.translation.cache[cacheKey]) {
            return this.settings.translation.cache[cacheKey];
        }

        try {
            const url = `api/v1/translate/index.php?text=${encodeURIComponent(text)}&from=${from}&to=${to}`;
            const response = await fetch(url);
            const data = await response.json();

            if (data.success && data.translation) {
                const translation = data.translation;
                // Cache the translation
                this.settings.translation.cache[cacheKey] = translation;
                return translation;
            } else {
                console.warn('Translation failed:', data);
                return null;
            }
        } catch (error) {
            console.error('Translation error:', error);
            return null;
        }
    }

    loadTranslationSettings() {
        try {
            const savedSettings = localStorage.getItem('meshlog_translation_settings');
            if (savedSettings) {
                const settings = JSON.parse(savedSettings);
                if (settings.fromLang) this.settings.translation.fromLang = settings.fromLang;
                if (settings.toLang) this.settings.translation.toLang = settings.toLang;
                if (typeof settings.enabled === 'boolean') this.settings.translation.enabled = settings.enabled;
            }
        } catch (error) {
            console.warn('Failed to load translation settings:', error);
        }
    }

    saveTranslationSettings() {
        try {
            const settings = {
                fromLang: this.settings.translation.fromLang,
                toLang: this.settings.translation.toLang,
                enabled: this.settings.translation.enabled
            };
            localStorage.setItem('meshlog_translation_settings', JSON.stringify(settings));
        } catch (error) {
            console.warn('Failed to save translation settings:', error);
        }
    }

    resetAllTranslations() {
        // Clear all translation cache
        this.settings.translation.cache = {};
        
        // Clear localStorage
        try {
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith('translation_')) {
                    localStorage.removeItem(key);
                }
            });
        } catch (error) {
            console.warn('Failed to clear localStorage:', error);
        }
        
        // Reset all message groups
        Object.entries(this.messages).forEach(([key, msgGroup]) => {
            if (msgGroup.isTranslated) {
                // Reset translation state
                msgGroup.isTranslated = false;
                msgGroup.originalText = null;
                msgGroup.translatedText = null;
                
                // Reset display
                const msg = msgGroup.first();
                if (msg && msg.data.message) {
                    msgGroup.dom.text.innerHTML = this.sanitizeMessage(msg.data.message);
                }
                
                // Reset button
                msgGroup.dom.translateBtn.innerText = "T";
                msgGroup.dom.translateBtn.title = "Translate message";
                msgGroup.dom.translateBtn.setAttribute("data-state", "translate");
                msgGroup.dom.translateBtn.disabled = false;
            }
        });
        
        console.log('All translations reset to original');
    }
}

