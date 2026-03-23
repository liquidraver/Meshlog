// TODO: Each Object Type sohuld have its own class with "updateDom()" function, that will update DOM with changed new values

// Extract removeEmojis to module level for performance
const removeEmojis = (str) => {
    return str.replace(
        /([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDD00-\uDFFF])/g,
        ''
    );
};

// Create smooth curved path between two points following earth curvature
// Optimized: reduces steps on mobile for better performance
function createCurvedPath(start, end, curvature = 0.1) {
    // Calculate great circle distance for more natural earth-following curve
    const toRad = Math.PI / 180;
    const lat1 = start[0] * toRad;
    const lon1 = start[1] * toRad;
    const lat2 = end[0] * toRad;
    const lon2 = end[1] * toRad;
    
    // Calculate great circle intermediate points
    const points = [];
    // Reduce steps on mobile for better performance, keep full quality on desktop
    const steps = (typeof isMobile !== 'undefined' && isMobile) ? 8 : 15;
    
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        
        // Great circle interpolation
        const d = Math.acos(Math.sin(lat1) * Math.sin(lat2) + 
                           Math.cos(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1));
        
        if (d === 0) {
            points.push([start[0], start[1]]);
            continue;
        }
        
        const a = Math.sin((1 - t) * d) / Math.sin(d);
        const b = Math.sin(t * d) / Math.sin(d);
        
        const x = a * Math.cos(lat1) * Math.cos(lon1) + b * Math.cos(lat2) * Math.cos(lon2);
        const y = a * Math.cos(lat1) * Math.sin(lon1) + b * Math.cos(lat2) * Math.sin(lon2);
        const z = a * Math.sin(lat1) + b * Math.sin(lat2);
        
        const lat = Math.atan2(z, Math.sqrt(x * x + y * y)) / toRad;
        const lon = Math.atan2(y, x) / toRad;
        
        // Add subtle perpendicular offset for visual curve
        const dx = end[1] - start[1];
        const dy = end[0] - start[0];
        const distance = Math.sqrt(dx * dx + dy * dy);
        const perpLat = -dx * curvature * distance * 0.3;
        const perpLon = dy * curvature * distance * 0.3;
        
        // Apply subtle offset using sine wave for smooth curve
        const offsetFactor = Math.sin(t * Math.PI);
        points.push([lat + perpLat * offsetFactor, lon + perpLon * offsetFactor]);
    }
    
    return points;
}

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
        this.hash  = data.public_key.substr(0, 2).toLowerCase(); // 1-byte path hash
        this.hash2 = data.public_key.substr(0, 4).toLowerCase(); // 2-byte path hash
        this.hash3 = data.public_key.substr(0, 6).toLowerCase(); // 3-byte path hash
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
                    const pathHashSize = this._meshlog.getPathHashSize(path);
                    const selfHash = this._meshlog.getContactHash(this, pathHashSize);
                    const idx = parts.indexOf(selfHash);
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
            // Hash could be a path hash (2/4/6 chars) or a public key (64 chars)
            const linkHashSize = hash.length === 6 ? 3 : hash.length === 4 ? 2 : 1;
            let candidates = [];
            Object.entries(this._meshlog.contacts).forEach(([k,v]) => {
                const cmpHash = hash.length > 6 ? v.data.public_key : this._meshlog.getContactHash(v, linkHashSize);
                if (cmpHash === hash && v.adv && !v.adv.isVeryExpired()) {
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
                const hasOffset = dir.out; // If both in and out, we'll use offset for out
                if (hasOffset) {
                    // Use straight line when offset will be used for outgoing
                    layers.push(L.polyline([src, dst], {
                        color: 'rgba(255, 255, 255, 0.8)',
                        weight: ln_outline,
                        opacity: 0.6
                    }));
                    layers.push(L.polyline([src, dst], {
                        color: '#FF5252',
                        weight: ln_weight,
                        opacity: 0.9
                    }));
                } else {
                    // Use curved path when no offset needed
                    const curvedPath = createCurvedPath(src, dst, 0.08);
                    layers.push(L.polyline(curvedPath, {
                        color: 'rgba(255, 255, 255, 0.8)',
                        weight: ln_outline,
                        opacity: 0.6,
                        smoothFactor: 1.0
                    }));
                    layers.push(L.polyline(curvedPath, {
                        color: '#FF5252',
                        weight: ln_weight,
                        opacity: 0.9,
                        smoothFactor: 1.0
                    }));
                }
            }

            // Blue is outgoing
            if (dir.out) {
                let offset = dir.in ? ln_offset : 0;
                if (offset !== 0) {
                    // Use straight line when offset is needed
                    layers.push(L.polyline([src, dst], {
                        color: 'rgba(255, 255, 255, 0.8)',
                        weight: ln_outline,
                        offset: offset,
                        opacity: 0.6
                    }));
                    layers.push(L.polyline([src, dst], {
                        color: '#42A5F5',
                        weight: ln_weight,
                        offset: offset,
                        opacity: 0.9
                    }));
                } else {
                    // Use curved path when no offset needed
                    const curvedPath = createCurvedPath(src, dst, 0.08);
                    layers.push(L.polyline(curvedPath, {
                        color: 'rgba(255, 255, 255, 0.8)',
                        weight: ln_outline,
                        opacity: 0.6,
                        smoothFactor: 1.0
                    }));
                    layers.push(L.polyline(curvedPath, {
                        color: '#42A5F5',
                        weight: ln_weight,
                        opacity: 0.9,
                        smoothFactor: 1.0
                    }));
                }
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
            return;
        }

        let iconUrl = 'assets/img/tower.svg';
        let kl = 'marker-pin';
        let receipt = false;

        if (this.isClient()) {
            const rep = this.isReporter();
            if (rep) {
                receipt = dimColor(rep.data.color);
            } else {
                iconUrl = 'assets/img/person.svg';
            }
        } else if (this.isRepeater()) {
            iconUrl = 'assets/img/tower.svg';
        } else if (this.isRoom()) {
            iconUrl = 'assets/img/group.svg';
        } else if (this.isSensor()) {
            iconUrl = 'assets/img/sensor.svg';
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
            innerIcon.classList.add('marker-emoji');
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
            iconSize: [24, 24],
            iconAnchor: [12, 12],
            popupAnchor: [0, -12]
        });

        const self = this;

        const sanitizedName = this._meshlog.sanitizeText(this.adv.data.name);
        const sanitizedDate = this._meshlog.sanitizeText(this.adv.data.sent_at);
        let tooltip = `<p class="tooltip-title">${sanitizedName}</p><p class="tooltip-detail">Last adv: ${sanitizedDate}</p>`;

        this.marker = L.marker([this.adv.data.lat, this.adv.data.lon], { icon: icon }).addTo(map);
        this.marker.bindTooltip(tooltip);
        this.marker.on('mouseover', (e) => {
            self.highlight = 'yellow';
            self.updateDom();
        });
        this.marker.on('mouseout', (e) => {
            self.highlight = '';
            self.updateDom();
        });
        this.marker.on('click', (e) => {
            self._meshlog.filterByContact(self);
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
        } else if (this.adv.data.type == 4) {
            this.dom.icon.src = "assets/img/sensor.svg";
            this.dom.type.innerText = `Type: Sensor`;
        } else {
            this.dom.type.innerText = `Type: Unknown`;
            this.dom.icon.src = "assets/img/unknown.svg";
        }

        this.dom.name.innerText = this._meshlog.sanitizeText(this.adv.data.name);
        this.dom.date.innerText = this._meshlog.sanitizeText(this.adv.data.sent_at);
        this.dom.hash.innerText = `[${this._meshlog.validateHash(hashstr)}]`;

        if (this.highlight) {
            this.dom.name.classList.add("chighlight");
        } else {
            this.dom.name.classList.remove("chighlight");
        }

        this.dom.container.dataset.time = this.adv.time;
        this.dom.container.dataset.name = this._meshlog.sanitizeText(removeEmojis(this.adv.data.name).trim());
        this.dom.container.dataset.hash = this._meshlog.validateHash(hashstr);

        let allvis = Object.keys(this._meshlog.visible_contacts).length < 1;
        if (allvis || this._meshlog.visible_contacts.hasOwnProperty(this.data.id)) {
            this.dom.container.hidden = false;
        } else {
            this.dom.container.hidden = true;
        }
    }

    update() {
        this.updateDom();
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

    isSensor() {
        return this.adv && this.adv.data.type == 4;
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

        let hashBadge = document.createElement("span");
        hashBadge.classList.add("hash-badge");

        date.appendChild(document.createTextNode(''));
        date.appendChild(hashBadge);

        let text = document.createElement("span");
        text.classList.add("sp");

        let dot = document.createElement("span");
        dot.classList.add('dot');

        let reporter = this._meshlog.reporters[this.data.reporter_id];
        if (reporter) {
            dot.style.background = dimColor(reporter.data.color);
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
            hashBadge,
            text
        };
        
        return container;
    }

    updateDom() {
        if (!this.dom) return;
        this.dom.date.firstChild.textContent = this._meshlog.sanitizeText(this.data.sent_at);
        if (this.data.path) {
            const hashSize = this._meshlog.getPathHashSize(this.data.path);
            this.dom.hashBadge.textContent = ` (${hashSize}-byte)`;
        } else {
            this.dom.hashBadge.textContent = '';
        }
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

// Country detection cache to avoid repeated API calls

// Dim/reduce vibrancy of a color (for reporter colors)
function dimColor(color) {
    if (!color) return color;
    
    // Handle hex colors
    if (color.startsWith('#')) {
        const hex = color.slice(1);
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        
        // Convert RGB to HSL
        const rNorm = r / 255;
        const gNorm = g / 255;
        const bNorm = b / 255;
        
        const max = Math.max(rNorm, gNorm, bNorm);
        const min = Math.min(rNorm, gNorm, bNorm);
        let h, s, l = (max + min) / 2;
        
        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            
            switch (max) {
                case rNorm: h = ((gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0)) / 6; break;
                case gNorm: h = ((bNorm - rNorm) / d + 2) / 6; break;
                case bNorm: h = ((rNorm - gNorm) / d + 4) / 6; break;
            }
        }
        
        // Make more pastel: reduce saturation slightly (20%) and increase lightness (15%) for pastel effect
        s = Math.max(0, s * 0.8);
        l = Math.min(0.85, l * 1.15);
        
        // Convert back to RGB
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const x = c * (1 - Math.abs((h * 6) % 2 - 1));
        const m = l - c / 2;
        
        let rNew, gNew, bNew;
        if (h < 1/6) {
            rNew = c; gNew = x; bNew = 0;
        } else if (h < 2/6) {
            rNew = x; gNew = c; bNew = 0;
        } else if (h < 3/6) {
            rNew = 0; gNew = c; bNew = x;
        } else if (h < 4/6) {
            rNew = 0; gNew = x; bNew = c;
        } else if (h < 5/6) {
            rNew = x; gNew = 0; bNew = c;
        } else {
            rNew = c; gNew = 0; bNew = x;
        }
        
        rNew = Math.round((rNew + m) * 255);
        gNew = Math.round((gNew + m) * 255);
        bNew = Math.round((bNew + m) * 255);
        
        return `#${rNew.toString(16).padStart(2, '0')}${gNew.toString(16).padStart(2, '0')}${bNew.toString(16).padStart(2, '0')}`;
    }
    
    // Handle HSL colors
    if (color.startsWith('hsl')) {
        const match = color.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
        if (match) {
            const h = parseInt(match[1]);
            let s = parseInt(match[2]);
            let l = parseInt(match[3]);
            
            s = Math.max(0, s * 0.8); // Reduce saturation by 20% for pastel
            l = Math.min(85, l * 1.15); // Increase lightness by 15% for pastel effect
            
            return `hsl(${h}, ${Math.round(s)}%, ${Math.round(l)}%)`;
        }
    }
    
    // Handle RGB colors
    if (color.startsWith('rgb')) {
        const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (match) {
            const r = parseInt(match[1]);
            const g = parseInt(match[2]);
            const b = parseInt(match[3]);
            
            // Convert to HSL, dim, convert back
            const rNorm = r / 255;
            const gNorm = g / 255;
            const bNorm = b / 255;
            
            const max = Math.max(rNorm, gNorm, bNorm);
            const min = Math.min(rNorm, gNorm, bNorm);
            let h, s, l = (max + min) / 2;
            
            if (max !== min) {
                const d = max - min;
                s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
                
                switch (max) {
                    case rNorm: h = ((gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0)) / 6; break;
                    case gNorm: h = ((bNorm - rNorm) / d + 2) / 6; break;
                    case bNorm: h = ((rNorm - gNorm) / d + 4) / 6; break;
                }
            } else {
                h = s = 0;
            }
            
            s = Math.max(0, s * 0.8); // Reduce saturation by 20% for pastel
            l = Math.min(0.85, l * 1.15); // Increase lightness by 15% for pastel effect
            
            const c = (1 - Math.abs(2 * l - 1)) * s;
            const x = c * (1 - Math.abs((h * 6) % 2 - 1));
            const m = l - c / 2;
            
            let rNew, gNew, bNew;
            if (h < 1/6) {
                rNew = c; gNew = x; bNew = 0;
            } else if (h < 2/6) {
                rNew = x; gNew = c; bNew = 0;
            } else if (h < 3/6) {
                rNew = 0; gNew = c; bNew = x;
            } else if (h < 4/6) {
                rNew = 0; gNew = x; bNew = c;
            } else if (h < 5/6) {
                rNew = x; gNew = 0; bNew = c;
            } else {
                rNew = c; gNew = 0; bNew = x;
            }
            
            rNew = Math.round((rNew + m) * 255);
            gNew = Math.round((gNew + m) * 255);
            bNew = Math.round((bNew + m) * 255);
            
            return `rgb(${rNew}, ${gNew}, ${bNew})`;
        }
    }
    
    // If we can't parse it, return as-is
    return color;
}

// Generate consistent strong color from string (good contrast on blue background)
// Uses better distribution to ensure distinct colors with added randomness
function stringToColor(str) {
    // Multi-pass hash for better distribution and more randomness
    let hash1 = 0;
    let hash2 = 0;
    let hash3 = 0;
    
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        // First hash: standard shift-add
        hash1 = ((hash1 << 5) - hash1) + char;
        hash1 = hash1 & hash1; // Convert to 32-bit integer
        
        // Second hash: different multiplier for variation
        hash2 = ((hash2 << 7) - hash2) + char;
        hash2 = hash2 & hash2;
        
        // Third hash: position-dependent for more randomness
        hash3 = ((hash3 << 3) - hash3) + (char * (i + 1));
        hash3 = hash3 & hash3;
    }
    
    // Combine hashes with different operations to add randomness
    const combinedHash = (hash1 ^ (hash2 << 16) ^ (hash3 >> 8)) >>> 0;
    
    // Use multiple golden ratio multipliers for better distribution
    const goldenRatio1 = 0.618033988749895;
    const goldenRatio2 = 0.381966011250105; // 1 - goldenRatio
    const goldenRatio3 = 0.23606797749979; // Another related value
    
    // Generate hue using multiple ratios and combine with XOR for randomness
    const hue1 = Math.abs((combinedHash * goldenRatio1) % 1) * 360;
    const hue2 = Math.abs((hash2 * goldenRatio2) % 1) * 360;
    const hue3 = Math.abs((hash3 * goldenRatio3) % 1) * 360;
    
    // Combine hues with weighted average and add noise
    const baseHue = (hue1 * 0.5 + hue2 * 0.3 + hue3 * 0.2) % 360;
    const noise = (combinedHash % 20) - 10; // -10 to +10 degrees of noise
    let hue = (baseHue + noise + 360) % 360;
    
    // Strong, vibrant colors - avoid pastels
    // Use different parts of hash for saturation and lightness to add variation
    const satHash = (combinedHash ^ hash2) >>> 0;
    const lightHash = (combinedHash ^ hash3) >>> 0;
    
    const saturation = 85 + (Math.abs(satHash) % 15); // 85-100%
    const lightness = 55 + (Math.abs(lightHash) % 15); // 55-70%
    
    // Avoid colors too close to blue (200-240 degrees) for better contrast
    let adjustedHue = hue;
    if (hue >= 200 && hue <= 240) {
        // Shift blue hues to warmer colors with some randomness
        const shiftAmount = (combinedHash % 40) - 20; // -20 to +20
        adjustedHue = (hue < 220) ? (180 + shiftAmount) : (250 + shiftAmount);
        adjustedHue = (adjustedHue + 360) % 360;
    }
    
    return `hsl(${Math.round(adjustedHue)}, ${saturation}%, ${lightness}%)`;
}

class MeshLogMessageGroup extends MeshLogObject {
    constructor(meshlog, data) {
        super(meshlog, data);
        this.messages = {};
        this.channelColor = null;
        this.usernameColor = null;
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

        let hashBadgeGroup = document.createElement("span");
        hashBadgeGroup.classList.add("hash-badge");

        date.appendChild(document.createTextNode(''));
        date.appendChild(hashBadgeGroup);

        // Only create translate button for non-advertisement messages
        let translateBtn = null;
        const firstMsg = this.first();
        if (firstMsg && !(firstMsg instanceof MeshLogAdvertisement)) {
            translateBtn = document.createElement("button");
            translateBtn.classList.add("translate-btn");
            translateBtn.innerText = "T";
            translateBtn.title = "Translate message";
            translateBtn.style.marginLeft = "4px";
            translateBtn.style.marginRight = "12px";
            translateBtn.setAttribute("data-state", "translate");
            translateBtn.onclick = (e) => {
                e.stopPropagation();
                this.translateMessage();
            }
        }

        let message = document.createElement("div");

        let name = document.createElement("span");
        name.classList.add("sp");
        name.classList.add("t");

        let text = document.createElement("span");
        text.classList.add("sp");
        text.classList.add("message-text");

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

        let child = document.createElement("div");
        child.style.borderLeft = "solid 2px #888";
        child.style.marginLeft = "2px";
        child.hidden = true;

        Object.entries(this.messages).forEach(([k,v]) => {
            v.createDom(child);
        });

        message.appendChild(name);
        message.appendChild(text);

        // Wrap message content in a row so date can be on top
        let messageRow = document.createElement("div");
        messageRow.classList.add("message-row");
        if (translateBtn) {
            messageRow.appendChild(translateBtn);
        }
        messageRow.appendChild(message);
        messageRow.appendChild(right);

        group.appendChild(date);
        group.appendChild(messageRow);
        container.appendChild(group);
        container.appendChild(child);

        this.dom = {
            container,
            group,
            name,
            date,
            hashBadge: hashBadgeGroup,
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
        this.dom.date.firstChild.textContent = this._meshlog.sanitizeText(msg.data.sent_at);
        // Find best hash size across all reporters (prefer 1/2/3-byte over direct)
        let bestHashSize = 0;
        for (const m of Object.values(this.messages)) {
            const hs = this._meshlog.getPathHashSize(m.data.path);
            if (hs > bestHashSize) bestHashSize = hs;
        }
        if (bestHashSize > 0) {
            this.dom.hashBadge.textContent = ` (${bestHashSize}-byte)`;
        } else {
            this.dom.hashBadge.textContent = '';
        }
        
        const sz = this.size();
        this.dom.count.innerText = `×${sz}`;

        let hidden = false;

        // Handle advertisements first - make them bland
        if (msg instanceof MeshLogAdvertisement) {
            // Check if node's internal time (received_at) deviates from server time by 30+ minutes
            // received_at = node's internal time (from database, from data['time']['sender'])
            // created_at = when server received/processed the advert (from database, set by DEFAULT current_timestamp())
            let isWrongTime = false;
            // Compare node's internal time with server's time
            const nodeInternalTime = msg.data.received_at; // From database: node's internal time
            const serverCreatedAt = msg.data.created_at; // From database: server's creation timestamp
            
            if (nodeInternalTime && serverCreatedAt) {
                try {
                    const nodeTime = new Date(nodeInternalTime).getTime();
                    const serverTime = new Date(serverCreatedAt).getTime();
                    if (!isNaN(nodeTime) && !isNaN(serverTime) && nodeTime > 0 && serverTime > 0) {
                        const diffMs = Math.abs(serverTime - nodeTime);
                        const diffMinutes = diffMs / (1000 * 60);
                        // If difference is 30 minutes or more, node's clock is wrong
                        if (diffMinutes >= 30) {
                            isWrongTime = true;
                        }
                    }
                } catch (e) {
                    // If date parsing fails, ignore
                }
            }
            
            // Regular adverts: grey, wrong time adverts: red
            this.dom.text.innerText = "Advert" + (isWrongTime ? " - wrong time" : "");
            this.dom.text.style.color = isWrongTime ? '#ff6666' : '#888888'; // Red for wrong time, grey for normal
            // Keep date color same as messages (blue) - don't override
            
            // Make name colored based on reporter's color if in Hungary/Slovakia/Poland
            this.dom.name.innerHTML = '';
            const nameSpan = document.createElement('span');
            
            let nameColor = '#80CBC4'; // Default teal/cyan
            
            // Use country_code from database
            if (msg.data.reporter_id && msg.data.country_code) {
                const reporter = this._meshlog.reporters[msg.data.reporter_id];
                if (reporter && reporter.data && reporter.data.color) {
                    // Use stored country_code from database
                    if (['HU', 'SK', 'PL'].includes(msg.data.country_code)) {
                        nameSpan.style.color = dimColor(reporter.data.color);
                    }
                }
            }
            
            nameSpan.style.color = nameColor;
            const displayName = this._meshlog.sanitizeText(msg.data.name);
            nameSpan.textContent = displayName + ": ";
            this.dom.name.appendChild(nameSpan);
            
            hidden = !this._meshlog.settings.types.advertisements;
        } else {
            // Build name with colors for non-advertisement messages
            let username = this._meshlog.sanitizeText(msg.data.name);
            let channelName = null;
            
            // Clear name element to rebuild with proper colors
            this.dom.name.innerHTML = '';
            
            if (msg instanceof MeshLogChannelMessage && msg.data.channel_id) {
                // Get channel from database using channel_id
                const channel = this._meshlog.channels[msg.data.channel_id];
                if (channel && channel.data.name) {
                    channelName = channel.data.name;
                    
                    // Get or create consistent channel color
                    if (!this._meshlog.channelColors[channelName]) {
                        this._meshlog.channelColors[channelName] = stringToColor(channelName);
                    }
                    const channelColor = this._meshlog.channelColors[channelName];
                    
                    // Create channel name span with color
                    const channelSpan = document.createElement('span');
                    channelSpan.style.color = channelColor;
                    channelSpan.textContent = `(${channelName}) `;
                    this.dom.name.appendChild(channelSpan);
                    
                    this.dom.group.classList.add('channel-message');
                    this.dom.group.style.setProperty('--channel-color', channelColor);
                }
            } else if (msg instanceof MeshLogDirecMessage) {
                this.dom.group.classList.add('direct-message');
            }
            
            // Set username color (consistent across all messages from same user)
            const usernameKey = msg.data.name || 'unknown';
            if (!this._meshlog.usernameColors[usernameKey]) {
                this._meshlog.usernameColors[usernameKey] = stringToColor(usernameKey);
            }
            const usernameColor = this._meshlog.usernameColors[usernameKey];
            
            // Add username span with color
            const usernameSpan = document.createElement('span');
            usernameSpan.style.color = usernameColor;
            usernameSpan.textContent = username + ": ";
            this.dom.name.appendChild(usernameSpan);
        }
        
        if (msg instanceof MeshLogChannelMessage) {
            // Preserve translation state during auto-refresh
            if (!this.isTranslated) {
                this.dom.text.innerHTML = this._meshlog.sanitizeMessage(msg.data.message);
            }
            this.dom.text.style.color = '#E1F5FE';
            
            // Check channel-specific filters using database channel names
            let channelFiltered = false;
            if (msg.data.channel_id) {
                const channel = this._meshlog.channels[msg.data.channel_id];
                if (channel && channel.data.name) {
                    const channelName = channel.data.name.toLowerCase();
                    const channelKey = channelName.replace(/[^a-z0-9]/g, '_');
                    // Get setting key, defaulting to true if not found
                    const channelSetting = this._meshlog.settings.channels[channelKey];
                    if (channelSetting === false) {
                        channelFiltered = true;
                    }
                }
            }
            
            hidden = !this._meshlog.settings.types.channel_messages || channelFiltered;
        } else if (msg instanceof MeshLogDirecMessage) {
            // Preserve translation state during auto-refresh
            if (!this.isTranslated) {
                this.dom.text.innerHTML = this._meshlog.sanitizeMessage(msg.data.message);
            }
            this.dom.text.style.color = 'white';
            hidden = !this._meshlog.settings.types.direct_messages;
        } else {
            // Unknown instance type
        }

        // Hash size filter (uses bestHashSize computed above for badge)
        if (!hidden) {
            if (bestHashSize === 0 && !this._meshlog.settings.hash_sizes.direct) hidden = true;
            else if (bestHashSize === 1 && !this._meshlog.settings.hash_sizes.byte_1) hidden = true;
            else if (bestHashSize === 2 && !this._meshlog.settings.hash_sizes.byte_2) hidden = true;
            else if (bestHashSize === 3 && !this._meshlog.settings.hash_sizes.byte_3) hidden = true;
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
        this.channelColors = {}; // Cache for consistent channel colors
        this.usernameColors = {}; // Cache for consistent username colors
        
        // Collision helper cache
        this.collisionHelperCache = null;
        this.collisionHelperCacheTime = null;

        this.messages = {};

        this.map = map;
        this.map_layers = {};
        this.pathRenderTimers = {}; // Track pending path render timers per path ID
        this.visible_markers = [];
        this.visible_contacts = {};
        this.reporterMarkers = {};
        this.link_pairs = {};
        this.dom_logs = document.getElementById(logsid);
        this.dom_contacts = document.getElementById(contactsid);
        this.timer = false;
        this.autorefresh = 0;
        this.selected_contact = null;
        this.info_box = null;

        // epoch of newest object
        this.latest = 0;
        this.window_active = true;
        this.new_messages = {};
        
        // Lazy loading for messages
        this.visibleMessageCount = 0;
        this.messagesPerPage = (typeof isMobile !== 'undefined' && isMobile) ? 50 : 100;
        this.isLoadingMore = false;
        this.allMessagesRendered = false;

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
            channels: {
                public: true,
                hungary: true,
                hungary_hash: true,
                ping: true,
            },
            hash_sizes: {
                byte_1: true,
                byte_2: true,
                byte_3: true,
                direct: true,
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
        this.dom_settings_reporters = sreportersid ? document.getElementById(sreportersid) : null;
        this.dom_settings_contacts = document.getElementById(scontactsid);
        this.dom_bots_list = document.getElementById('bots-list');
        
        // Cache frequently accessed DOM elements for performance
        this.dom_favicon = document.getElementById('favicon');
        
        // Performance optimization: cache distance calculations
        this.distanceCache = new Map();
        // Cache resolved hop sequences per (path, source) to stabilize routing
        this.resolvedPaths = new Map();
        
        // Performance optimization: debounce timers
        this.fadeMarkersTimer = null;
        
        // Performance optimization: track last bots update to enable incremental updates
        this.lastBotsUpdate = 0;
        this.botsCache = null;

        this.__init_types();
        this.__init_channels();
        this.__init_order();
        this.__init_translation();
        this.__init_bots();
        
        // Initialize lazy loading scroll listener
        this.__initLazyLoading();

        this.last = '2025-01-01 00:00:00';
    }
    
    __initLazyLoading() {
        const self = this;
        const leftbar = document.getElementById('leftbar');
        if (!leftbar) return;
        
        // Debounce scroll handler for performance
        let scrollTimeout = null;
        leftbar.addEventListener('scroll', function() {
            if (scrollTimeout) {
                clearTimeout(scrollTimeout);
            }
            scrollTimeout = setTimeout(() => {
                // Check if user scrolled near bottom (within 200px)
                const scrollTop = leftbar.scrollTop;
                const scrollHeight = leftbar.scrollHeight;
                const clientHeight = leftbar.clientHeight;
                const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
                
                // Load more if near bottom and not already loading
                if (distanceFromBottom < 200 && !self.isLoadingMore && !self.allMessagesRendered) {
                    self.loadMoreMessages();
                }
            }, 100);
        });
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
        
        // First escape the most dangerous characters for XSS in content
        let escaped = text.replace(/[<>&]/g, (match) => {
            const escapeMap = {
                '<': '&lt;',
                '>': '&gt;',
                '&': '&amp;'
            };
            return escapeMap[match];
        });
        
        // Then convert URLs to clickable links
        const urlRegex = /(https?:\/\/[^\s<>"']+)/gi;
        return escaped.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    }

    sanitizeColor(color) {
        if (typeof color !== 'string') return '#000000';
        if (/^#[0-9A-Fa-f]{6}$/.test(color)) return color;
        if (/^#[0-9A-Fa-f]{3}$/.test(color)) return color;
        return '#000000';
    }

    addReporterMarkers() {
        if (!this.map || !this.reporters) return;

        Object.entries(this.reporters).forEach(([id, reporter]) => {
            if (!reporter || !reporter.data) return;

            // Avoid recreating markers for the same reporter
            if (this.reporterMarkers[id]) return;

            const lat = parseFloat(reporter.data.lat);
            const lon = parseFloat(reporter.data.lon);

            // Require valid, non-zero coordinates
            if (!lat || !lon) return;

            const color = this.sanitizeColor(reporter.data.color || '#ffffff');
            const name = this.sanitizeText(reporter.data.name || 'Reporter');

            // Use receipt.svg, tinted via inline SVG in a divIcon
            const hw = '20px';
            const wrapper = document.createElement('div');
            wrapper.classList.add('reporter-icon');

            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('height', hw);
            svg.setAttribute('width', hw);
            svg.setAttribute('viewBox', '0 -960 960 960');
            svg.setAttribute('fill', color);

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', 'M240-80q-50 0-85-35t-35-85v-120h120v-560l60 60 60-60 60 60 60-60 60 60 60-60 60 60 60-60 60 60 60-60v680q0 50-35 85t-85 35H240Zm480-80q17 0 28.5-11.5T760-200v-560H320v440h360v120q0 17 11.5 28.5T720-160ZM360-600v-80h240v80H360Zm0 120v-80h240v80H360Zm320-120q-17 0-28.5-11.5T640-640q0-17 11.5-28.5T680-680q17 0 28.5 11.5T720-640q0 17-11.5 28.5T680-600Zm0 120q-17 0-28.5-11.5T640-520q0-17 11.5-28.5T680-560q17 0 28.5 11.5T720-520q0 17-11.5 28.5T680-480ZM240-160h360v-80H200v40q0 17 11.5 28.5T240-160Zm-40 0v-80 80Z');
            svg.appendChild(path);
            wrapper.appendChild(svg);

            const icon = L.divIcon({
                className: 'reporter-div-icon',
                html: wrapper,
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            });

            const marker = L.marker([lat, lon], { icon });

            marker.bindTooltip(name, { direction: 'top' });
            marker.addTo(this.map);

            this.reporterMarkers[id] = marker;
        });
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
        this.update();
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
            btn.classList.add('btn', 'sort-btn');
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

        // Add separator between sorting and action buttons
        let separator = document.createElement('div');
        separator.classList.add('button-separator');
        container.appendChild(separator);

        // Add Collision Helper button
        let collisionBtn = document.createElement('button');
        collisionBtn.classList.add('btn', 'collision-helper-btn');
        collisionBtn.innerText = 'Collision Helper';
        collisionBtn.onclick = (e) => {
            this.showCollisionHelper();
        };
        container.appendChild(collisionBtn);

        // Add Repeater Setup button
        let repeaterSetupBtn = document.createElement('button');
        repeaterSetupBtn.classList.add('btn', 'repeater-setup-btn');
        repeaterSetupBtn.innerText = 'Repeater Setup';
        repeaterSetupBtn.onclick = (e) => {
            this.openRepeaterSetup();
        };
        container.appendChild(repeaterSetupBtn);

        // Add Weekly Stats button
        let weeklyStatsBtn = document.createElement('button');
        weeklyStatsBtn.classList.add('btn', 'weekly-stats-btn');
        weeklyStatsBtn.innerText = 'Weekly Stats';
        weeklyStatsBtn.onclick = (e) => {
            this.openWeeklyStats();
        };
        container.appendChild(weeklyStatsBtn);

        // Add Node Stats button
        let nodeStatsBtn = document.createElement('button');
        nodeStatsBtn.classList.add('btn', 'weekly-stats-btn');
        nodeStatsBtn.innerText = 'Node Stats';
        nodeStatsBtn.onclick = (e) => {
            this.openNodeStats();
        };
        container.appendChild(nodeStatsBtn);

        // Add Packet Stats button
        let packetStatsBtn = document.createElement('button');
        packetStatsBtn.classList.add('btn', 'weekly-stats-btn');
        packetStatsBtn.innerText = 'Packet Stats';
        packetStatsBtn.onclick = (e) => {
            this.openPacketStats();
        };
        container.appendChild(packetStatsBtn);

        this.dom_settings_contacts.appendChild(container);
    }

    __init_types() {
        // Message type filters moved to __init_channels() - now called __init_filters()
        // This function is kept for backward compatibility but is now empty
    }

    __init_channels() {
        const self = this;
        
        // Add filter section header
        let channelHeader = document.createElement('div');
        channelHeader.classList.add('settings-header');
        channelHeader.innerHTML = '<span>Filters</span><span class="toggle-icon">▶</span>';
        
        let channelControls = document.createElement('div');
        channelControls.classList.add('channel-controls');
        channelControls.style.display = 'none';
        channelControls.style.flexDirection = 'column';
        channelControls.style.gap = '8px';
        
        // Store reference for later updates
        this.dom_channel_controls = channelControls;
        
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

        // Add existing message type filters
        channelControls.appendChild(
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

        channelControls.appendChild(
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

        channelControls.appendChild(
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

        // Hash size filter separator
        let hashSizeLabel = document.createElement('div');
        hashSizeLabel.style.cssText = 'color: #888; font-size: 11px; margin-top: 6px; border-top: 1px solid #444; padding-top: 6px;';
        hashSizeLabel.textContent = 'Hash Size';
        channelControls.appendChild(hashSizeLabel);

        channelControls.appendChild(
            this.__createCb(
                "1-byte packets",
                "assets/img/beacon.png",
                this.settings.hash_sizes.byte_1,
                (e) => {
                    this.settings.hash_sizes.byte_1 = e.target.checked;
                    self.__onTypesChanged(e);
                }
            )
        );

        channelControls.appendChild(
            this.__createCb(
                "2-byte packets",
                "assets/img/beacon.png",
                this.settings.hash_sizes.byte_2,
                (e) => {
                    this.settings.hash_sizes.byte_2 = e.target.checked;
                    self.__onTypesChanged(e);
                }
            )
        );

        channelControls.appendChild(
            this.__createCb(
                "3-byte packets",
                "assets/img/beacon.png",
                this.settings.hash_sizes.byte_3,
                (e) => {
                    this.settings.hash_sizes.byte_3 = e.target.checked;
                    self.__onTypesChanged(e);
                }
            )
        );

        channelControls.appendChild(
            this.__createCb(
                "Direct (0-hop)",
                "assets/img/beacon.png",
                this.settings.hash_sizes.direct,
                (e) => {
                    this.settings.hash_sizes.direct = e.target.checked;
                    self.__onTypesChanged(e);
                }
            )
        );

        // Channel filter checkboxes will be created dynamically when channels load
        // (Don't call __refreshChannelFilters() here - channels aren't loaded yet)
    }

    __refreshChannelFilters() {
        if (!this.dom_channel_controls) return; // Not initialized yet
        
        // Remove existing channel filter checkboxes (keep message type filters)
        // Find all checkboxes that are channel filters (they follow message type filters)
        const existingCheckboxes = this.dom_channel_controls.querySelectorAll('.channel-filter');
        existingCheckboxes.forEach(cb => cb.remove());
        
        // Create checkboxes for each channel from database
        const channelCount = Object.keys(this.channels).length;
        if (channelCount === 0) {
            // No channels loaded yet, filters will be created when channels load
            return;
        }
        
        Object.entries(this.channels).forEach(([id, channel]) => {
            if (!channel || !channel.data) {
                return;
            }
            
            // enabled might be 0/1 from DB or true/false, check both
            if (channel.data.enabled === false || channel.data.enabled === 0) {
                return; // Skip disabled channels
            }
            
            const channelName = channel.data.name || 'unknown';
            if (!channelName || channelName === 'unknown') {
                return;
            }
            
            const channelKey = channelName.toLowerCase().replace(/[^a-z0-9]/g, '_');
            
            // Initialize setting if it doesn't exist (default to true)
            if (this.settings.channels[channelKey] === undefined) {
                this.settings.channels[channelKey] = true;
            }
            
            const checkboxContainer = this.__createCb(
                channelName + " Channel",
                "assets/img/message.png",
                this.settings.channels[channelKey],
                (e) => {
                    this.settings.channels[channelKey] = e.target.checked;
                    this.__onTypesChanged(e);
                }
            );
            checkboxContainer.classList.add('channel-filter');
            this.dom_channel_controls.appendChild(checkboxContainer);
        });
    }

    __init_reporters() {
        Object.entries(this.reporters).forEach(([id,_]) => {
            let reporter = this.reporters[id];
            if (reporter.hasOwnProperty('dom')) {
                return;
            }
            const self = this;
            this.reporters[id].enabled = true;
            if (this.dom_settings_reporters && typeof this.dom_settings_reporters !== 'undefined' && this.dom_settings_reporters !== null) {
                try {
                    this.dom_settings_reporters.hidden = true;
                } catch (e) {
                    // Ignore if property cannot be set
                }
            }
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

    __init_bots() {
        if (!this.dom_bots_list) return;
        this.updateBotsList();
    }

    updateBotsList() {
        if (!this.dom_bots_list) return;
        
        // Performance optimization: only update if data has changed significantly
        const now = Date.now();
        if (this.botsCache && (now - this.lastBotsUpdate) < 5000) {
            // Use cached data if updated recently (within 5 seconds)
            return;
        }
        this.lastBotsUpdate = now;

        const reporterLastReport = {};

        // Find last report time from advertisements (use sent_at for actual send time)
        Object.entries(this.advertisements).forEach(([k, msg]) => {
            if (msg.data.reporter_id && this.reporters[msg.data.reporter_id]) {
                const reporterId = msg.data.reporter_id;
                // Use sent_at (when message was sent) or created_at as fallback
                const timeStr = msg.data.sent_at || msg.data.created_at;
                const reportTime = timeStr ? new Date(timeStr).getTime() : 0;
                if (reportTime > 0 && (!reporterLastReport[reporterId] || reportTime > reporterLastReport[reporterId])) {
                    reporterLastReport[reporterId] = reportTime;
                }
            }
        });

        // Find last report time from channel messages (use sent_at for actual send time)
        Object.entries(this.channel_messages).forEach(([k, msg]) => {
            if (msg.data.reporter_id && this.reporters[msg.data.reporter_id]) {
                const reporterId = msg.data.reporter_id;
                // Use sent_at (when message was sent) or created_at as fallback
                const timeStr = msg.data.sent_at || msg.data.created_at;
                const reportTime = timeStr ? new Date(timeStr).getTime() : 0;
                if (reportTime > 0 && (!reporterLastReport[reporterId] || reportTime > reporterLastReport[reporterId])) {
                    reporterLastReport[reporterId] = reportTime;
                }
            }
        });

        // Find last report time from direct messages (use sent_at for actual send time)
        Object.entries(this.direct_messages).forEach(([k, msg]) => {
            if (msg.data.reporter_id && this.reporters[msg.data.reporter_id]) {
                const reporterId = msg.data.reporter_id;
                // Use sent_at (when message was sent) or created_at as fallback
                const timeStr = msg.data.sent_at || msg.data.created_at;
                const reportTime = timeStr ? new Date(timeStr).getTime() : 0;
                if (reportTime > 0 && (!reporterLastReport[reporterId] || reportTime > reporterLastReport[reporterId])) {
                    reporterLastReport[reporterId] = reportTime;
                }
            }
        });

        // Build the list
        const bots = Object.entries(this.reporters).map(([id, reporter]) => {
            const lastReportTime = reporterLastReport[id] || 0;
            const lastReportDate = lastReportTime > 0 ? new Date(lastReportTime) : null;
            const timeAgo = lastReportDate ? this.getTimeAgo(lastReportTime) : 'Never';
            
            return {
                id: id,
                name: reporter.data.name || 'Unknown',
                color: dimColor(reporter.data.color || '#888'),
                lastReport: lastReportDate,
                timeAgo: timeAgo
            };
        });

        // Sort by last report time (most recent first)
        bots.sort((a, b) => {
            const timeA = a.lastReport ? a.lastReport.getTime() : 0;
            const timeB = b.lastReport ? b.lastReport.getTime() : 0;
            return timeB - timeA;
        });

        // Cache the bots data for incremental updates
        this.botsCache = bots;
        
        // Use document fragment for better DOM performance
        const fragment = document.createDocumentFragment();
        
        if (bots.length === 0) {
            const emptyDiv = document.createElement('div');
            emptyDiv.classList.add('bots-empty');
            emptyDiv.textContent = 'No bots found';
            fragment.appendChild(emptyDiv);
        } else {
            bots.forEach(bot => {
            const botItem = document.createElement('div');
            botItem.classList.add('bot-item');
            
            const dot = document.createElement('span');
            dot.classList.add('bot-dot');
            dot.style.background = bot.color;
            
            const info = document.createElement('div');
            info.classList.add('bot-info');
            
            const name = document.createElement('div');
            name.classList.add('bot-name');
            name.textContent = bot.name;
            
            const time = document.createElement('div');
            time.classList.add('bot-time');
            time.textContent = bot.timeAgo;
            
            info.appendChild(name);
            info.appendChild(time);
            
            botItem.appendChild(dot);
            botItem.appendChild(info);
            
            fragment.appendChild(botItem);
            });
        }
        
        // Single DOM update instead of multiple appends
        this.dom_bots_list.innerHTML = '';
        this.dom_bots_list.appendChild(fragment);
    }

    getTimeAgo(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) {
            return `${days}d ago`;
        } else if (hours > 0) {
            return `${hours}h ago`;
        } else if (minutes > 0) {
            return `${minutes}m ago`;
        } else {
            return 'Just now';
        }
    }

    __addObject(dataset, id, obj) {
        if (dataset.hasOwnProperty(id)) {
            dataset[id].merge(obj.data);
        } else {
            dataset[id] = obj;
        }
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
            query.count = params['count'];
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
            self.__loadObjects(self.advertisements, data, MeshLogAdvertisement);
            self.onLoadAll();
            if (onload) onload();
        });

        this.__fetchQuery({ "before_ms": oldest_grp }, 'api/v1/channel_messages', data => {
            self.__loadObjects(self.channel_messages, data, MeshLogChannelMessage);
            self.onLoadAll();
            if (onload) onload();
        });

        this.__fetchQuery({ "before_ms": oldest_dm }, 'api/v1/direct_messages', data => {
            self.__loadObjects(self.direct_messages, data, MeshLogDirecMessage);
            self.onLoadAll();
            if (onload) onload();
        });
    }


    loadAll(params={}, onload=null) {
        // Ensure we request enough contacts for initial load
        if (!params.count && !params.after_ms) {
            params.count = 2000; // Request more contacts for initial load (reduced from 3000 for better performance)
        }
        this.__fetchQuery(params, 'api/v1/all', data => {
            this.__loadObjects(this.reporters, data.reporters, MeshLogReporter);
            this.__loadObjects(this.contacts, data.contacts, MeshLogContact);
            this.__loadObjects(this.channels, data.channels, MeshLogChannel);
            this.__loadObjects(this.advertisements, data.advertisements, MeshLogAdvertisement);
            this.__loadObjects(this.channel_messages, data.channel_messages, MeshLogChannelMessage);
            this.__loadObjects(this.direct_messages, data.direct_messages, MeshLogDirecMessage);

            this.__init_reporters();
            // Refresh channel filters after channels are loaded
            this.__refreshChannelFilters();
            this.onLoadAll();

            if (onload) {
                onload({
                    reporters: data.reporters,
                    contacts: data.contacts,
                    groups: data.channels,
                    advertisements: data.advertisements,
                    channel_messages: data.channel_messages,
                    direct_messages: data.direct_messages,
                });
            }
        });
    }

    onLoadContacts() {
        let hashes = {};
        
        // Use document fragment for batch DOM updates
        const fragment = document.createDocumentFragment();
        const contactsToAdd = [];
        
        // First, process existing contacts
        Object.entries(this.contacts).forEach(([id,contact]) => {
            let advs = Object.values(this.advertisements)
                .filter(item => item.data.contact_id == id)
                .sort((a, b) => {
                    const aTime = a.data.sent_at || a.data.created_at || '';
                    const bTime = b.data.sent_at || b.data.created_at || '';
                    return bTime.localeCompare(aTime);
                });
            let adv = advs.length > 0 ? advs[0] : null;

            if (!adv && contact.data.advertisement) {
                adv = new MeshLogAdvertisement(this, contact.data.advertisement);
                // Ensure contact_id is set if missing (for embedded advertisements)
                if (adv && !adv.data.contact_id && contact.data.id) {
                    adv.data.contact_id = contact.data.id;
                }
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

            // Create DOM but don't append yet
            const domElement = contact.createDom(null);
            if (domElement) {
                fragment.appendChild(domElement);
            }
            contactsToAdd.push(contact);
        });
        
        // Batch DOM updates: add all contacts at once
        if (fragment.hasChildNodes()) {
            this.dom_contacts.appendChild(fragment);
        }
        
        // Add markers to map and update (these are separate operations)
        contactsToAdd.forEach(contact => {
            contact.addToMap(this.map);
            contact.update();
        });
        
            this.sortContacts();
        }

    async showCollisionHelper() {
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

        // Check cache (30 second TTL)
        const cacheAge = this.collisionHelperCacheTime ? Date.now() - this.collisionHelperCacheTime : Infinity;
        let repeaterContacts = {};
        
        if (this.collisionHelperCache && cacheAge < 30000) {
            // Use cached data
            repeaterContacts = this.collisionHelperCache;
        } else {
            // Show loading state
            tableContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #888;">Loading repeaters...</div>';
            modalContent.appendChild(header);
            modalContent.appendChild(tableContainer);
            modal.appendChild(modalContent);
            document.body.appendChild(modal);

            // Fetch all repeaters from API (not just loaded ones)
            try {
                const response = await fetch('/api/v1/all?count=5000', {
                    headers: {
                        'Accept': 'application/json',
                    }
                });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            // Check different possible response structures
            let contacts = null;
            if (data.contacts && data.contacts.objects) {
                contacts = data.contacts.objects;
            } else if (data.contacts && Array.isArray(data.contacts)) {
                contacts = data.contacts;
            } else if (Array.isArray(data)) {
                contacts = data;
            }
            
            if (!contacts) {
                throw new Error('No contacts found in API response');
            }
            
            // Process all contacts to find repeaters
            contacts.forEach(contact => {
                // Check if contact has an advertisement and if it's a repeater (type 2)
                if (contact.advertisement && contact.advertisement.type === 2 && contact.public_key) {
                    const pubkey = contact.public_key.toUpperCase();
                    const hexId = pubkey.substring(0, 2).toLowerCase();
                    
                    repeaterContacts[hexId] = repeaterContacts[hexId] || [];
                    repeaterContacts[hexId].push({
                        name: contact.advertisement.name || 'Unknown',
                        publicKey: pubkey
                    });
                }
            });
            
                // Cache the result
                this.collisionHelperCache = repeaterContacts;
                this.collisionHelperCacheTime = Date.now();
            } catch (error) {
                console.error('Failed to fetch all repeaters:', error);
                tableContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: #ff6666;">Failed to load repeaters. Using loaded contacts only.</div>';
                // Fallback to using loaded contacts only
                Object.entries(this.contacts).forEach(([id, contact]) => {
                    let advs = Object.values(this.advertisements)
                        .filter(item => item.data.contact_id == id)
                        .sort((a, b) => {
                            const aTime = a.data.sent_at || a.data.created_at || '';
                            const bTime = b.data.sent_at || b.data.created_at || '';
                            return bTime.localeCompare(aTime);
                        });
                    let adv = advs.length > 0 ? advs[0] : null;
                    if (!adv && contact.data.advertisement) {
                        adv = new MeshLogAdvertisement(this, contact.data.advertisement);
                    }
                    if (!adv) return;

                    if (!contact.data.public_key || contact.data.public_key.length < 2) return;

                    let hashstr = contact.data.public_key.substr(0, 2).toLowerCase();
                    const advType = adv && adv.data && adv.data.type != null ? adv.data.type : null;
                    const isRepeater = advType == 2 || advType === 2 || advType === '2';
                    
                    if (isRepeater) {
                        repeaterContacts[hashstr] = repeaterContacts[hashstr] || [];
                        repeaterContacts[hashstr].push({
                            name: adv.data.name || 'Unknown',
                            publicKey: contact.data.public_key
                        });
                    }
                });
            }
        }
        
        // If we showed loading, clear it now and append modal if not already appended
        if (tableContainer.innerHTML.includes('Loading')) {
            tableContainer.innerHTML = '';
            if (!modalContent.parentElement) {
                modalContent.appendChild(header);
                modalContent.appendChild(tableContainer);
                modal.appendChild(modalContent);
                document.body.appendChild(modal);
            }
        } else if (!modalContent.parentElement) {
            // Cache hit - append modal immediately
            modalContent.appendChild(header);
            modalContent.appendChild(tableContainer);
            modal.appendChild(modalContent);
            document.body.appendChild(modal);
        }

        // Clear loading message and generate hex ID grid (01 to FE)
        tableContainer.innerHTML = '';
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
    }

    openRepeaterSetup() {
        // Helper function to open in new tab (not popup)
        const openInNewTab = (url) => {
            const link = document.createElement('a');
            link.href = url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        };

        // Intelligent check for Web Serial API support
        const hasSerialAPI = 'serial' in navigator;
        const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');
        const serialFunctional = hasSerialAPI && 
                                 navigator.serial && 
                                 typeof navigator.serial.requestPort === 'function';
        
        if (serialFunctional) {
            // Browser natively supports serial connections
            openInNewTab('https://map.mc868.hu/config/repeater-setup.html');
        } else if (isFirefox) {
            // Firefox detected - check if addon might provide serial API
            const hasSerialProperty = 'serial' in navigator;
            if (hasSerialProperty) {
                // Serial property exists (possibly from addon), allow opening
                // The page itself will test if it's actually functional
                if (confirm('Firefox detected with possible Web Serial API support.\n\n' +
                           'If you have a Web Serial API addon installed, it may work.\n\n' +
                           'Open Repeater Setup page in new tab?')) {
                    openInNewTab('https://map.mc868.hu/config/repeater-setup.html');
                }
            } else {
                // No serial API detected in Firefox
                if (confirm('Web Serial API not detected in Firefox.\n\n' +
                           'You can install a Web Serial API addon for Firefox:\n' +
                           '• Search for "Web Serial API" in Firefox Add-ons\n' +
                           '• Or use a browser with native support:\n' +
                           '  - Google Chrome (version 89+)\n' +
                           '  - Microsoft Edge (version 89+)\n' +
                           '  - Opera (version 75+)\n\n' +
                           'Open Repeater Setup page in new tab anyway?')) {
                    openInNewTab('https://map.mc868.hu/config/repeater-setup.html');
                }
            }
        } else {
            // Other browsers without native support
            if (confirm('Web Serial API not detected.\n\n' +
                       'Please use one of these browsers:\n' +
                       '• Google Chrome (version 89+)\n' +
                       '• Microsoft Edge (version 89+)\n' +
                       '• Opera (version 75+)\n' +
                       '• Firefox with Web Serial API addon\n\n' +
                       'Open Repeater Setup page in new tab anyway?')) {
                openInNewTab('https://map.mc868.hu/config/repeater-setup.html');
            }
        }
    }

    async openWeeklyStats() {
        // Create modal overlay
        let modal = document.createElement('div');
        modal.classList.add('collision-helper-modal', 'weekly-stats-modal');
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        };

        // Create modal content
        let modalContent = document.createElement('div');
        modalContent.classList.add('collision-helper-content', 'weekly-stats-content');
        modalContent.onclick = (e) => e.stopPropagation();

        // Create header
        let header = document.createElement('div');
        header.classList.add('collision-helper-header');
        header.innerHTML = '<h3>Weekly Stats (Last 7 Days)</h3><button class="close-btn">&times;</button>';
        header.querySelector('.close-btn').onclick = () => modal.remove();

        // Create loading indicator
        let content = document.createElement('div');
        content.classList.add('weekly-stats-content-body');
        content.innerHTML = '<p style="text-align: center; color: #888; padding: 20px;">Loading stats...</p>';
        modalContent.appendChild(header);
        modalContent.appendChild(content);
        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        try {
            // Fetch weekly stats from API
            const response = await fetch('api/v1/weekly_stats/index.php');
            if (!response.ok) {
                if (response.status === 429) {
                    const errorData = await response.json().catch(() => ({}));
                    const retryAfter = response.headers.get('Retry-After') || '60';
                    throw new Error(`Rate limit exceeded. Please try again in ${retryAfter} seconds.`);
                }
                const errorText = await response.text().catch(() => 'Unknown error');
                throw new Error(`Failed to fetch weekly stats: ${response.status} ${errorText}`);
            }
            const stats = await response.json();

            // Clear loading indicator
            content.innerHTML = '';

            // Channel Messages Section
            let channelSection = document.createElement('div');
            channelSection.classList.add('stats-section');
            channelSection.innerHTML = '<h4>Channel Messages</h4>';
            
            let channelTable = document.createElement('table');
            channelTable.classList.add('stats-table');
            let channelTableHead = document.createElement('thead');
            channelTableHead.innerHTML = '<tr><th>Channel</th><th>Messages</th><th>Avg/Day</th><th>vs Last Week</th></tr>';
            channelTable.appendChild(channelTableHead);
            
            let channelTableBody = document.createElement('tbody');
            if (stats.channel_messages.by_channel && stats.channel_messages.by_channel.length > 0) {
                stats.channel_messages.by_channel.forEach(channel => {
                    let row = document.createElement('tr');
                    let diff = Math.round(channel.diff_avg_per_day || 0);
                    let diffText = diff === 0 ? '0' : (diff > 0 ? `+${diff}` : `${diff}`);
                    let diffColor = diff === 0 ? '#ffffff' : (diff > 0 ? '#66bb6a' : '#ef5350');
                    row.innerHTML = `<td>${this.sanitizeText(channel.channel_name || 'Unknown')}</td><td>${channel.message_count}</td><td style="color: #42a5f5;">${channel.avg_per_day || 0}</td><td style="color: ${diffColor}">${diffText}</td>`;
                    channelTableBody.appendChild(row);
                });
            } else {
                let row = document.createElement('tr');
                row.innerHTML = '<td colspan="4" style="text-align: center; color: #888;">No channel messages</td>';
                channelTableBody.appendChild(row);
            }
            channelTable.appendChild(channelTableBody);
            channelSection.appendChild(channelTable);
            
            let channelTotal = document.createElement('div');
            channelTotal.classList.add('stats-total');
            let channelAvg = stats.channel_messages.total ? Math.round(stats.channel_messages.total / 7) : 0;
            let channelDiff = stats.channel_messages.total - (stats.channel_messages.total_previous || 0);
            let channelDiffAvg = Math.round(channelDiff / 7);
            let channelDiffText = channelDiffAvg === 0 ? '0' : (channelDiffAvg > 0 ? `+${channelDiffAvg}` : channelDiffAvg);
            let channelDiffColor = channelDiffAvg === 0 ? '#ffffff' : (channelDiffAvg > 0 ? '#66bb6a' : '#ef5350');
            channelTotal.innerHTML = `<strong>Total: ${stats.channel_messages.total}</strong> | <span style="color: #42a5f5;">Avg/Day: ${channelAvg}</span> | <span style="color: ${channelDiffColor}">${channelDiffText}</span>`;
            channelSection.appendChild(channelTotal);
            content.appendChild(channelSection);

            // Advertisements Section
            let advSection = document.createElement('div');
            advSection.classList.add('stats-section');
            advSection.innerHTML = '<h4>Advertisements</h4>';
            
            let advTable = document.createElement('table');
            advTable.classList.add('stats-table');
            let advTableHead = document.createElement('thead');
            advTableHead.innerHTML = '<tr><th>Type</th><th>Count</th><th>Avg/Day</th><th>vs Last Week</th></tr>';
            advTable.appendChild(advTableHead);
            
            let advTableBody = document.createElement('tbody');
            if (stats.advertisements.by_type && stats.advertisements.by_type.length > 0) {
                stats.advertisements.by_type.forEach(type => {
                    let row = document.createElement('tr');
                    let diff = Math.round(type.diff_avg_per_day || 0);
                    let diffText = diff === 0 ? '0' : (diff > 0 ? `+${diff}` : `${diff}`);
                    let diffColor = diff === 0 ? '#ffffff' : (diff > 0 ? '#66bb6a' : '#ef5350');
                    row.innerHTML = `<td>${this.sanitizeText(type.type)}</td><td>${type.count}</td><td style="color: #42a5f5;">${type.avg_per_day || 0}</td><td style="color: ${diffColor}">${diffText}</td>`;
                    advTableBody.appendChild(row);
                });
            } else {
                let row = document.createElement('tr');
                row.innerHTML = '<td colspan="4" style="text-align: center; color: #888;">No advertisements</td>';
                advTableBody.appendChild(row);
            }
            advTable.appendChild(advTableBody);
            advSection.appendChild(advTable);
            
            let advTotal = document.createElement('div');
            advTotal.classList.add('stats-total');
            let advAvg = stats.advertisements.total ? Math.round(stats.advertisements.total / 7) : 0;
            let advDiff = stats.advertisements.total - (stats.advertisements.total_previous || 0);
            let advDiffAvg = Math.round(advDiff / 7);
            let advDiffText = advDiffAvg === 0 ? '0' : (advDiffAvg > 0 ? `+${advDiffAvg}` : advDiffAvg);
            let advDiffColor = advDiffAvg === 0 ? '#ffffff' : (advDiffAvg > 0 ? '#66bb6a' : '#ef5350');
            advTotal.innerHTML = `<strong>Total: ${stats.advertisements.total}</strong> | <span style="color: #42a5f5;">Avg/Day: ${advAvg}</span> | <span style="color: ${advDiffColor}">${advDiffText}</span>`;
            advSection.appendChild(advTotal);
            content.appendChild(advSection);

            // Processed Packets Section
            let packetsSection = document.createElement('div');
            packetsSection.classList.add('stats-section');
            packetsSection.innerHTML = '<h4>Processed Packets</h4>';
            
            let packetsTable = document.createElement('table');
            packetsTable.classList.add('stats-table');
            let packetsTableHead = document.createElement('thead');
            packetsTableHead.innerHTML = '<tr><th>Reporter</th><th>Packets</th><th>Avg/Day</th><th>vs Last Week</th></tr>';
            packetsTable.appendChild(packetsTableHead);
            
            let packetsTableBody = document.createElement('tbody');
            if (stats.processed_packets.by_reporter && stats.processed_packets.by_reporter.length > 0) {
                stats.processed_packets.by_reporter.forEach(reporter => {
                    let row = document.createElement('tr');
                    let diff = Math.round(reporter.diff_avg_per_day || 0);
                    let diffText = diff === 0 ? '0' : (diff > 0 ? `+${diff}` : `${diff}`);
                    let diffColor = diff === 0 ? '#ffffff' : (diff > 0 ? '#66bb6a' : '#ef5350');
                    row.innerHTML = `<td>${this.sanitizeText(reporter.reporter_name || 'Unknown')}</td><td>${reporter.packet_count}</td><td style="color: #42a5f5;">${reporter.avg_per_day || 0}</td><td style="color: ${diffColor}">${diffText}</td>`;
                    packetsTableBody.appendChild(row);
                });
            } else {
                let row = document.createElement('tr');
                row.innerHTML = '<td colspan="4" style="text-align: center; color: #888;">No processed packets</td>';
                packetsTableBody.appendChild(row);
            }
            packetsTable.appendChild(packetsTableBody);
            packetsSection.appendChild(packetsTable);
            
            let packetsTotal = document.createElement('div');
            packetsTotal.classList.add('stats-total');
            let packetsAvg = stats.processed_packets.total ? Math.round(stats.processed_packets.total / 7) : 0;
            let packetsDiff = stats.processed_packets.total - (stats.processed_packets.total_previous || 0);
            let packetsDiffAvg = Math.round(packetsDiff / 7);
            let packetsDiffText = packetsDiffAvg === 0 ? '0' : (packetsDiffAvg > 0 ? `+${packetsDiffAvg}` : packetsDiffAvg);
            let packetsDiffColor = packetsDiffAvg === 0 ? '#ffffff' : (packetsDiffAvg > 0 ? '#66bb6a' : '#ef5350');
            packetsTotal.innerHTML = `<strong>Total: ${stats.processed_packets.total}</strong> | <span style="color: #42a5f5;">Avg/Day: ${packetsAvg}</span> | <span style="color: ${packetsDiffColor}">${packetsDiffText}</span>`;
            packetsSection.appendChild(packetsTotal);
            content.appendChild(packetsSection);

            // Date range info (convert UTC to local timezone)
            if (stats.date_range) {
                let dateInfo = document.createElement('div');
                dateInfo.classList.add('stats-date-range');
                
                // Convert UTC timestamps to local time in same format as messages (YYYY-MM-DD HH:mm:ss)
                let formatLocalDate = (utcString) => {
                    // Parse UTC string (format: YYYY-MM-DD HH:mm:ss) as UTC
                    let date = new Date(utcString.replace(' ', 'T') + 'Z');
                    let year = date.getFullYear();
                    let month = String(date.getMonth() + 1).padStart(2, '0');
                    let day = String(date.getDate()).padStart(2, '0');
                    let hours = String(date.getHours()).padStart(2, '0');
                    let minutes = String(date.getMinutes()).padStart(2, '0');
                    let seconds = String(date.getSeconds()).padStart(2, '0');
                    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
                };
                
                let fromLocal = formatLocalDate(stats.date_range.from);
                let toLocal = formatLocalDate(stats.date_range.to);
                dateInfo.innerHTML = `<small style="color: #888;">Period: ${fromLocal} to ${toLocal}</small>`;
                content.appendChild(dateInfo);
            }

        } catch (error) {
            console.error('Error loading weekly stats:', error);
            content.innerHTML = `<p style="text-align: center; color: #f44; padding: 20px;">Error loading stats: ${error.message}</p>`;
        }
    }

    async openNodeStats() {
        // Prevent multiple modals from opening (debounce)
        if (this._nodeStatsModalOpen) {
            return;
        }
        this._nodeStatsModalOpen = true;

        // Create modal overlay
        let modal = document.createElement('div');
        modal.classList.add('collision-helper-modal', 'weekly-stats-modal');
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.remove();
                this._nodeStatsModalOpen = false;
            }
        };

        // Create modal content
        let modalContent = document.createElement('div');
        modalContent.classList.add('collision-helper-content', 'weekly-stats-content');
        modalContent.onclick = (e) => e.stopPropagation();

        // Create header
        let header = document.createElement('div');
        header.classList.add('collision-helper-header');
        header.innerHTML = '<h3>Node Stats by Country</h3><button class="close-btn">&times;</button>';
        header.querySelector('.close-btn').onclick = () => {
            modal.remove();
            this._nodeStatsModalOpen = false;
        };

        // Create loading indicator
        let content = document.createElement('div');
        content.classList.add('weekly-stats-content-body');
        content.innerHTML = '<p style="text-align: center; color: #888; padding: 20px;">Loading stats...</p>';
        modalContent.appendChild(header);
        modalContent.appendChild(content);
        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        try {
            // Fetch node stats from API
            const response = await fetch('api/v1/node_stats/index.php');
            if (!response.ok) {
                if (response.status === 429) {
                    const errorData = await response.json().catch(() => ({}));
                    const retryAfter = response.headers.get('Retry-After') || '60';
                    throw new Error(`Rate limit exceeded. Please try again in ${retryAfter} seconds.`);
                }
                const errorText = await response.text().catch(() => 'Unknown error');
                throw new Error(`Failed to fetch node stats: ${response.status} ${errorText}`);
            }
            const stats = await response.json();

            // Clear loading indicator
            content.innerHTML = '';

            // Nodes by Country Section
            let countrySection = document.createElement('div');
            countrySection.classList.add('stats-section');
            countrySection.innerHTML = '<h4>Nodes by Country</h4>';
            
            let countryTable = document.createElement('table');
            countryTable.classList.add('stats-table');
            let countryTableHead = document.createElement('thead');
            countryTableHead.innerHTML = '<tr><th>Country</th><th>Repeaters</th><th>Clients</th><th>Rooms</th><th>Sensors</th><th>Total</th></tr>';
            countryTable.appendChild(countryTableHead);
            
            let countryTableBody = document.createElement('tbody');
            if (stats.by_country && stats.by_country.length > 0) {
                stats.by_country.forEach(country => {
                    let row = document.createElement('tr');
                    row.innerHTML = `
                        <td><strong>${this.sanitizeText(country.country_name || 'Unknown')}</strong></td>
                        <td>${country.repeaters || 0}</td>
                        <td>${country.clients || 0}</td>
                        <td>${country.rooms || 0}</td>
                        <td>${country.sensors || 0}</td>
                        <td style="color: #42a5f5;"><strong>${country.total || 0}</strong></td>
                    `;
                    countryTableBody.appendChild(row);
                });
            } else {
                let row = document.createElement('tr');
                row.innerHTML = '<td colspan="6" style="text-align: center; color: #888;">No nodes found</td>';
                countryTableBody.appendChild(row);
            }
            countryTable.appendChild(countryTableBody);
            countrySection.appendChild(countryTable);
            
            let countryTotal = document.createElement('div');
            countryTotal.classList.add('stats-total');
            countryTotal.innerHTML = `<strong>Total Nodes: ${stats.total || 0}</strong>`;
            countrySection.appendChild(countryTotal);
            content.appendChild(countrySection);

        } catch (error) {
            console.error('Error loading node stats:', error);
            content.innerHTML = `<p style="text-align: center; color: #f44; padding: 20px;">Error loading stats: ${error.message}</p>`;
        } finally {
            // Reset flag if modal is removed
            setTimeout(() => {
                if (!document.body.contains(modal)) {
                    this._nodeStatsModalOpen = false;
                }
            }, 100);
        }
    }

    async openPacketStats() {
        if (this._packetStatsModalOpen) return;
        this._packetStatsModalOpen = true;

        let modal = document.createElement('div');
        modal.classList.add('collision-helper-modal', 'weekly-stats-modal');
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.remove();
                this._packetStatsModalOpen = false;
            }
        };

        let modalContent = document.createElement('div');
        modalContent.classList.add('collision-helper-content', 'weekly-stats-content');
        modalContent.onclick = (e) => e.stopPropagation();

        let header = document.createElement('div');
        header.classList.add('collision-helper-header');
        header.innerHTML = '<h3>Packet Stats</h3><button class="close-btn">&times;</button>';
        header.querySelector('.close-btn').onclick = () => {
            modal.remove();
            this._packetStatsModalOpen = false;
        };

        let content = document.createElement('div');
        content.classList.add('weekly-stats-content-body');
        content.innerHTML = '<p style="text-align: center; color: #888; padding: 20px;">Loading packet stats...</p>';
        modalContent.appendChild(header);
        modalContent.appendChild(content);
        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        try {
            const response = await fetch('api/v1/packet_stats/index.php');
            if (!response.ok) {
                if (response.status === 429) {
                    const retryAfter = response.headers.get('Retry-After') || '60';
                    throw new Error(`Rate limit exceeded. Try again in ${retryAfter}s.`);
                }
                throw new Error(`Failed to fetch packet stats: ${response.status}`);
            }
            const stats = await response.json();
            content.innerHTML = '';

            const pct = (count, total) => total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
            const diff = (thisW, lastW) => {
                if (lastW === 0) return thisW > 0 ? '+100.0' : '0.0';
                const change = ((thisW - lastW) / lastW) * 100;
                return (change >= 0 ? '+' : '') + change.toFixed(1);
            };
            const diffColor = (thisW, lastW) => {
                if (thisW > lastW) return '#4caf50';
                if (thisW < lastW) return '#f44336';
                return '#888';
            };

            // This Week Overview
            const tw = stats.this_week;
            const lw = stats.last_week;

            let overviewSection = document.createElement('div');
            overviewSection.classList.add('stats-section');
            overviewSection.innerHTML = '<h4>This Week (last 7 days)</h4>';

            let overviewTable = document.createElement('table');
            overviewTable.classList.add('stats-table');
            overviewTable.innerHTML = `
                <thead><tr><th>Hash Size</th><th>Count</th><th>%</th><th>Last Week</th><th>Change</th></tr></thead>
                <tbody>
                    <tr>
                        <td><strong>1-byte</strong></td>
                        <td>${tw['1-byte']}</td>
                        <td>${pct(tw['1-byte'], tw.total)}%</td>
                        <td>${lw['1-byte']}</td>
                        <td style="color: ${diffColor(tw['1-byte'], lw['1-byte'])}">${diff(tw['1-byte'], lw['1-byte'])}%</td>
                    </tr>
                    <tr>
                        <td><strong>2-byte</strong></td>
                        <td>${tw['2-byte']}</td>
                        <td>${pct(tw['2-byte'], tw.total)}%</td>
                        <td>${lw['2-byte']}</td>
                        <td style="color: ${diffColor(tw['2-byte'], lw['2-byte'])}">${diff(tw['2-byte'], lw['2-byte'])}%</td>
                    </tr>
                    <tr>
                        <td><strong>3-byte</strong></td>
                        <td>${tw['3-byte']}</td>
                        <td>${pct(tw['3-byte'], tw.total)}%</td>
                        <td>${lw['3-byte']}</td>
                        <td style="color: ${diffColor(tw['3-byte'], lw['3-byte'])}">${diff(tw['3-byte'], lw['3-byte'])}%</td>
                    </tr>
                    <tr>
                        <td><strong>Direct (0-hop)</strong></td>
                        <td>${tw['direct']}</td>
                        <td>${pct(tw['direct'], tw.total)}%</td>
                        <td>${lw['direct']}</td>
                        <td style="color: ${diffColor(tw['direct'], lw['direct'])}">${diff(tw['direct'], lw['direct'])}%</td>
                    </tr>
                </tbody>
            `;
            overviewSection.appendChild(overviewTable);

            let totalRow = document.createElement('div');
            totalRow.classList.add('stats-total');
            totalRow.innerHTML = `<strong>Total: ${tw.total}</strong> (last week: ${lw.total}, <span style="color: ${diffColor(tw.total, lw.total)}">${diff(tw.total, lw.total)}%</span>)`;
            overviewSection.appendChild(totalRow);
            content.appendChild(overviewSection);

            // Breakdown by message type
            const typeLabels = {
                'advertisements': 'Advertisements',
                'direct_messages': 'Direct Messages',
                'channel_messages': 'Channel Messages'
            };

            let breakdownSection = document.createElement('div');
            breakdownSection.classList.add('stats-section');
            breakdownSection.innerHTML = '<h4>By Message Type (this week)</h4>';

            let breakdownTable = document.createElement('table');
            breakdownTable.classList.add('stats-table');
            breakdownTable.innerHTML = '<thead><tr><th>Type</th><th>1-byte</th><th>2-byte</th><th>3-byte</th><th>Direct</th><th>Total</th></tr></thead>';

            let breakdownBody = document.createElement('tbody');
            for (const [table, label] of Object.entries(typeLabels)) {
                const t = stats.by_type[table];
                if (!t) continue;
                let row = document.createElement('tr');
                row.innerHTML = `
                    <td><strong>${label}</strong></td>
                    <td>${t['1-byte']} (${pct(t['1-byte'], t.total)}%)</td>
                    <td>${t['2-byte']} (${pct(t['2-byte'], t.total)}%)</td>
                    <td>${t['3-byte']} (${pct(t['3-byte'], t.total)}%)</td>
                    <td>${t['direct']} (${pct(t['direct'], t.total)}%)</td>
                    <td style="color: #42a5f5;"><strong>${t.total}</strong></td>
                `;
                breakdownBody.appendChild(row);
            }
            breakdownTable.appendChild(breakdownBody);
            breakdownSection.appendChild(breakdownTable);
            content.appendChild(breakdownSection);

        } catch (error) {
            console.error('Error loading packet stats:', error);
            content.innerHTML = `<p style="text-align: center; color: #f44; padding: 20px;">Error: ${error.message}</p>`;
        } finally {
            setTimeout(() => {
                if (!document.body.contains(modal)) {
                    this._packetStatsModalOpen = false;
                }
            }, 100);
        }
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
        let pk = hash.length > 6;
        for (const [_, contact] of Object.entries(this.contacts)) {
            if (pk && contact.data.public_key == hash) {
                return contact;
            } else if (contact.hash3 == hash || contact.hash2 == hash || contact.hash == hash) {
                return contact;
            }
        }
        return undefined;
    }

    update() {
        // Get all messages sorted by time (newest first)
        const sortedMessages = Object.entries(this.messages)
            .map(([key, msg]) => ({ key, msg, time: msg.time || 0 }))
            .sort((a, b) => b.time - a.time);
        
        // Track which messages are already rendered
        const renderedKeys = new Set();
        const existingChildren = Array.from(this.dom_logs.children);
        existingChildren.forEach(child => {
            if (child.dataset && child.dataset.messageHash) {
                renderedKeys.add(child.dataset.messageHash);
            }
        });
        
        const totalMessages = sortedMessages.length;
        const currentVisibleCount = renderedKeys.size;
        
        // Check if there are new messages that need to be rendered
        const newMessages = sortedMessages.filter(({ key }) => !renderedKeys.has(key));
        
        // Determine how many messages to render
        // On initial load or if we have fewer than one page, render all
        const shouldRenderAll = currentVisibleCount === 0 || 
                                currentVisibleCount >= totalMessages ||
                                this.allMessagesRendered ||
                                totalMessages <= this.messagesPerPage;
        
        if (shouldRenderAll) {
            // Render all messages (initial load or small dataset)
            // Use document fragment for batch DOM updates
            const fragment = document.createDocumentFragment();
            const messagesToCreate = [];
            
            sortedMessages.forEach(({ key, msg }) => {
                if (!renderedKeys.has(key)) {
                    messagesToCreate.push({ key, msg });
                }
            });
            
            // Create DOM elements in fragment first
            messagesToCreate.forEach(({ key, msg }) => {
                const domElement = msg.createDom(null);
                if (domElement) {
                    domElement.dataset.messageHash = key;
                    fragment.appendChild(domElement);
                }
            });
            
            // Insert new messages at the top (newest first), append if no existing children
            if (fragment.hasChildNodes()) {
                if (this.dom_logs.firstChild) {
                    this.dom_logs.insertBefore(fragment, this.dom_logs.firstChild);
                } else {
                    this.dom_logs.appendChild(fragment);
                }
            }
            
            // Update all messages (only update DOM, not recreate)
            sortedMessages.forEach(({ key, msg }) => {
                msg.update();
            });
            
            this.visibleMessageCount = totalMessages;
            this.allMessagesRendered = true;
        } else {
            // Lazy loading: only render visible messages
            // Always include new messages at the top
            const messagesToRender = [];
            
            // First, add all new messages (they should appear at the top)
            newMessages.forEach(({ key, msg }) => {
                messagesToRender.push({ key, msg });
            });
            
            // Then, add existing visible messages up to the page limit
            const existingMessagesToShow = Math.max(0, this.messagesPerPage - newMessages.length);
            const existingMessages = sortedMessages
                .filter(({ key }) => renderedKeys.has(key))
                .slice(0, existingMessagesToShow);
            existingMessages.forEach(({ key, msg }) => {
                messagesToRender.push({ key, msg });
            });
            
            // Use document fragment for batch DOM updates
            const fragment = document.createDocumentFragment();
            const messagesToCreate = [];
            
            messagesToRender.forEach(({ key, msg }) => {
                if (!renderedKeys.has(key)) {
                    messagesToCreate.push({ key, msg });
                }
            });
            
            // Create DOM elements in fragment
            messagesToCreate.forEach(({ key, msg }) => {
                const domElement = msg.createDom(null);
                if (domElement) {
                    domElement.dataset.messageHash = key;
                    fragment.appendChild(domElement);
                }
            });
            
            // Insert new messages at the top (newest first), append if no existing children
            if (fragment.hasChildNodes()) {
                if (this.dom_logs.firstChild) {
                    this.dom_logs.insertBefore(fragment, this.dom_logs.firstChild);
                } else {
                    this.dom_logs.appendChild(fragment);
                }
            }
            
            // Only update visible messages
            messagesToRender.forEach(({ key, msg }) => {
                msg.update();
            });
            
            this.visibleMessageCount = Math.max(currentVisibleCount, messagesToRender.length);
            this.allMessagesRendered = this.visibleMessageCount >= totalMessages;
        }
    }
    
    loadMoreMessages() {
        if (this.isLoadingMore || this.allMessagesRendered) return;
        
        this.isLoadingMore = true;
        const self = this;
        
        // Get all messages sorted by time (newest first)
        const sortedMessages = Object.entries(this.messages)
            .map(([key, msg]) => ({ key, msg, time: msg.time || 0 }))
            .sort((a, b) => b.time - a.time);
        
        const startIndex = this.visibleMessageCount;
        const endIndex = Math.min(startIndex + this.messagesPerPage, sortedMessages.length);
        const messagesToAdd = sortedMessages.slice(startIndex, endIndex);
        
        if (messagesToAdd.length === 0) {
            this.allMessagesRendered = true;
            this.isLoadingMore = false;
            return;
        }
        
        // Use requestAnimationFrame for smooth rendering
        requestAnimationFrame(() => {
            // createDom handles insertion order automatically based on time
            // We just need to ensure messages are rendered
            messagesToAdd.forEach(({ key, msg }) => {
                // Check if already rendered
                const existing = Array.from(self.dom_logs.children).find(
                    child => child.dataset && child.dataset.messageHash === key
                );
                if (!existing) {
                    const domElement = msg.createDom(self.dom_logs);
                    if (domElement) {
                        domElement.dataset.messageHash = key;
                    }
                }
                msg.update();
            });
            
            self.visibleMessageCount = endIndex;
            self.allMessagesRendered = endIndex >= sortedMessages.length;
            self.isLoadingMore = false;
        });
    }

    filterByContact(contact) {
        if (this.selected_contact && this.selected_contact.data.id === contact.data.id) {
            this.clearFilter();
            return;
        }

        this.selected_contact = contact;
        this.visible_contacts = {};
        this.visible_contacts[contact.data.id] = 1;

        this.showInfoBox(contact);
        this.update();
    }

    clearFilter() {
        this.selected_contact = null;
        this.visible_contacts = {};
        this.hideInfoBox();
        this.update();
    }

    showInfoBox(contact) {
        if (this.info_box) {
            this.hideInfoBox();
        }

        const box = document.createElement('div');
        box.id = 'node-info-box';
        box.classList.add('node-info-box');

        const closeBtn = document.createElement('button');
        closeBtn.classList.add('node-info-close');
        closeBtn.innerHTML = '×';
        closeBtn.onclick = () => {
            this.clearFilter();
        };

        const title = document.createElement('div');
        title.classList.add('node-info-title');
        title.textContent = 'Node Information';

        const content = document.createElement('div');
        content.classList.add('node-info-content');

        const nameRow = document.createElement('div');
        nameRow.classList.add('node-info-row');
        nameRow.innerHTML = `<strong>Name:</strong> <span>${this.sanitizeText(contact.adv ? contact.adv.data.name : contact.data.name || 'Unknown')}</span>`;

        const typeRow = document.createElement('div');
        typeRow.classList.add('node-info-row');
        let typeText = 'Unknown';
        if (contact.isClient()) typeText = 'Client';
        else if (contact.isRepeater()) typeText = 'Repeater';
        else if (contact.isRoom()) typeText = 'Room';
        else if (contact.isSensor()) typeText = 'Sensor';
        typeRow.innerHTML = `<strong>Type:</strong> <span>${typeText}</span>`;

        const hashRow = document.createElement('div');
        hashRow.classList.add('node-info-row');
        hashRow.innerHTML = `<strong>Hash:</strong> <span>[${this.validateHash(contact.hash)}]</span>`;

        const pubkeyRow = document.createElement('div');
        pubkeyRow.classList.add('node-info-row');
        const self = this;
        const pubkeySpan = document.createElement('span');
        pubkeySpan.classList.add('node-info-pubkey');
        pubkeySpan.textContent = contact.data.public_key;
        pubkeySpan.title = 'Click to copy contact URI';
        pubkeySpan.onclick = async () => {
            try {
                const contactUri = `meshcore://${contact.data.public_key}`;
                await navigator.clipboard.writeText(contactUri);
                self.showCopyNotification();
            } catch (err) {
                console.error('Failed to copy:', err);
            }
        };
        pubkeyRow.appendChild(document.createElement('strong')).textContent = 'Public Key: ';
        pubkeyRow.appendChild(document.createTextNode(' '));
        pubkeyRow.appendChild(pubkeySpan);

        const coordsRow = document.createElement('div');
        coordsRow.classList.add('node-info-row');
        if (contact.adv && contact.adv.data.lat && contact.adv.data.lon) {
            coordsRow.innerHTML = `<strong>Coordinates:</strong> <span>${contact.adv.data.lat.toFixed(6)}, ${contact.adv.data.lon.toFixed(6)}</span>`;
        } else {
            coordsRow.innerHTML = `<strong>Coordinates:</strong> <span>Not available</span>`;
        }

        const lastAdvRow = document.createElement('div');
        lastAdvRow.classList.add('node-info-row');
        if (contact.adv && contact.adv.data.sent_at) {
            lastAdvRow.innerHTML = `<strong>Last Advertisement:</strong> <span>${this.sanitizeText(contact.adv.data.sent_at)}</span>`;
        } else {
            lastAdvRow.innerHTML = `<strong>Last Advertisement:</strong> <span>Not available</span>`;
        }

        const createdRow = document.createElement('div');
        createdRow.classList.add('node-info-row');
        if (contact.data.created_at) {
            createdRow.innerHTML = `<strong>First Seen:</strong> <span>${this.sanitizeText(contact.data.created_at)}</span>`;
        }

        content.appendChild(nameRow);
        content.appendChild(typeRow);
        content.appendChild(hashRow);
        content.appendChild(pubkeyRow);
        content.appendChild(coordsRow);
        content.appendChild(lastAdvRow);
        if (contact.data.created_at) {
            content.appendChild(createdRow);
        }

        box.appendChild(closeBtn);
        box.appendChild(title);
        box.appendChild(content);

        const mapContainer = document.getElementById('map');
        mapContainer.appendChild(box);

        this.info_box = box;
    }

    hideInfoBox() {
        if (this.info_box) {
            this.info_box.remove();
            this.info_box = null;
        }
    }

    showCopyNotification() {
        const notification = document.createElement('div');
        notification.classList.add('copy-notification');
        notification.textContent = 'Node URI exported to clipboard';
        
        const mapContainer = document.getElementById('map');
        mapContainer.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
        
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 2000);
    }

    onLoadMessages() {
        Object.entries(this.advertisements).forEach(([id,_]) => { this.addMessage(this.advertisements[id]); });
        Object.entries(this.channel_messages).forEach(([id,_]) => { this.addMessage(this.channel_messages[id]); });
        Object.entries(this.direct_messages).forEach(([id,_]) => { this.addMessage(this.direct_messages[id]); });

        // Reset lazy loading state when new messages are loaded
        this.visibleMessageCount = 0;
        this.allMessagesRendered = false;
        
        this.update();
    }

    onLoadAll() {
        this.onLoadContacts();
        this.onLoadMessages();
        this.updateBotsList();
        this.addReporterMarkers();
    }

    loadReporters(params={}, onload=null) {
        this.__fetchQuery(params, 'api/v1/reporters', data => {
            this.__loadObjects(this.reporters, data, MeshLogObject);
            if (onload) onload();
        });
    }

    loadContacts(params={}, onload=null) {
        this.__fetchQuery(params, 'api/v1/contacts', data => {
            this.__loadObjects(this.contacts, data, MeshLogContact);
            if (onload) onload();
        });
    }

    loadAdvertisements(params={}, onload=null) {
        this.__fetchQuery(params, 'api/v1/advertisements', data => {
            this.__loadObjects(this.advertisements, data, MeshLogAdvertisement);
            if (onload) onload();
        });
    }

    loadChannels(params={}, onload=null) {
        this.__fetchQuery(params, 'api/v1/channels', data => {
            this.__loadObjects(this.channels, data, MeshLogObject);
            if (onload) onload();
        });
    }

    loadChannelMessages(params={}, onload=null) {
        this.__fetchQuery(params, 'api/v1/channel_messages', data => {
            this.__loadObjects(this.channel_messages, data, MeshLogChannelMessage);
            if (onload) onload();
        });
    }

    loadDirectMessages(params={}, onload=null) {
        this.__fetchQuery(params, 'api/v1/direct_messages', data => {
            this.__loadObjects(this.direct_messages, data, MeshLogDirecMessage);
            if (onload) onload();
        });
    }

    fadeMarkers(opacity=0.2) {
        // Debounce marker updates for better performance
        if (this.fadeMarkersTimer) {
            clearTimeout(this.fadeMarkersTimer);
        }
        
        const self = this;
        this.fadeMarkersTimer = setTimeout(() => {
            // Use requestAnimationFrame for smooth updates
            requestAnimationFrame(() => {
                const empty = self.visible_markers.length == 0; 
                Object.entries(self.contacts).forEach(([k,v]) => {
                    if (!v.marker) return;
                    if (empty || self.visible_markers.includes(v.marker)) {
                        v.marker.setOpacity(1);
                        v.marker.setZIndexOffset(1000);
                    } else {
                        v.marker.setOpacity(opacity);
                        v.marker.setZIndexOffset(2);
                    }
                });
                self.fadeMarkersTimer = null;
            });
        }, 16); // ~60fps debounce
    }

    // Detect path hash byte size from the path string (1, 2, or 3)
    getPathHashSize(path) {
        if (!path) return 1;
        const first = path.split(',')[0];
        if (!first) return 1;
        if (first.length === 6) return 3;
        if (first.length === 4) return 2;
        return 1;
    }

    // Get the correct hash property from a contact based on hash byte size
    getContactHash(contact, hashSize) {
        if (hashSize === 3) return contact.hash3;
        if (hashSize === 2) return contact.hash2;
        return contact.hash;
    }

    validatePath(hashes, src) {
        const pathNodes = [];
        const contacts = this.contacts;

        // Detect hash byte size from the first hash element
        const hashSize = (hashes.length > 0 && hashes[0]) ? this.getPathHashSize(hashes.join(',')) : 1;

        // Build a stable cache key for this logical path + source
        const srcKey = src && src.data && src.data.public_key ? src.data.public_key : '';
        const pathKey = `${hashes.join(',')}|${srcKey}`;
        
        // If we have a cached, still-valid resolution, reuse it
        if (this.resolvedPaths.has(pathKey)) {
            const cached = this.resolvedPaths.get(pathKey).filter(node =>
                node &&
                node.adv &&
                node.adv.data &&
                node.adv.data.lat != 0 &&
                node.adv.data.lon != 0 &&
                !node.adv.isExpired() &&
                node.isRepeater()
            );
            if (cached.length > 0) {
                return cached;
            }
        }
        
        for (let i = 0; i < hashes.length; i++) {
            const candidates = [];
            const hash = hashes[i];
            
            for (const v of Object.values(contacts)) {
                if (this.getContactHash(v, hashSize) === hash && v.adv && !v.adv.isExpired() && v.isRepeater()) {
                    // Exclude repeaters with zero or missing coordinates
                    if (v.adv.data && v.adv.data.lat != 0 && v.adv.data.lon != 0) {
                        candidates.push(v);
                    }
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
                                if (this.getContactHash(v, hashSize) === secondHash && v.adv && !v.adv.isExpired() && v.isRepeater()) {
                                    // Exclude repeaters with zero or missing coordinates
                                    if (v.adv.data && v.adv.data.lat != 0 && v.adv.data.lon != 0) {
                                        secondHopCandidates.push(v);
                                    }
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
                    if (!previousNode || !previousNode.adv || !previousNode.adv.data) {
                        // No valid previous node, fall back to first candidate
                        selectedNode = candidates[0];
                    } else {
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
            }
            
            if (selectedNode) {
                pathNodes.push(selectedNode);
            }
        }
        
        // Cache resolved path for stability, with simple size control
        if (pathNodes.length > 0) {
            if (this.resolvedPaths.size > 1000) {
                this.resolvedPaths.clear();
            }
            this.resolvedPaths.set(pathKey, pathNodes);
        }

        return pathNodes;
    }


    calculateDistance(lat1, lon1, lat2, lon2) {
        // Build an order-independent cache key so A->B and B->A share the same entry
        const aKey = `${lat1.toFixed(4)}_${lon1.toFixed(4)}`;
        const bKey = `${lat2.toFixed(4)}_${lon2.toFixed(4)}`;
        const cacheKey = aKey < bKey ? `${aKey}__${bKey}` : `${bKey}__${aKey}`;
        
        if (this.distanceCache.has(cacheKey)) {
            return this.distanceCache.get(cacheKey);
        }
        
        // Haversine formula for great-circle distance (in km)
        const toRad = Math.PI / 180;
        const phi1 = lat1 * toRad;
        const phi2 = lat2 * toRad;
        const dPhi = (lat2 - lat1) * toRad;
        const dLambda = (lon2 - lon1) * toRad;
        
        const sinDphi = Math.sin(dPhi / 2);
        const sinDlambda = Math.sin(dLambda / 2);
        const a = sinDphi * sinDphi +
                  Math.cos(phi1) * Math.cos(phi2) * sinDlambda * sinDlambda;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const R = 6371; // Earth radius in km
        const distance = R * c;
        
        // Cache the result (limit cache size to prevent memory issues)
        if (this.distanceCache.size > 1000) {
            // Clear oldest 500 entries when cache gets too large
            const entries = Array.from(this.distanceCache.entries());
            this.distanceCache.clear();
            entries.slice(-500).forEach(([k, v]) => this.distanceCache.set(k, v));
        }
        this.distanceCache.set(cacheKey, distance);
        
        return distance;
    }

    showPath(id, path, src, dst, color) {
        if (this.map_layers.hasOwnProperty(id)) return;
        
        // Cancel any pending render for this path
        if (this.pathRenderTimers[id]) {
            clearTimeout(this.pathRenderTimers[id]);
        }
        
        const self = this;
        this.pathRenderTimers[id] = setTimeout(() => {
            // Check if path should still be shown (not hidden in the meantime)
            if (!self.map_layers.hasOwnProperty(id)) {
                self._renderPath(id, path, src, dst, color);
            }
            delete self.pathRenderTimers[id];
        }, 50); // 50ms debounce for path rendering
    }
    
    _renderPath(id, path, src, dst, color) {
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
                // Only add if coordinates are valid (not zero)
                if (src.adv.data.lat != 0 && src.adv.data.lon != 0) {
                    last.push([src.adv.data.lat, src.adv.data.lon]);
                    if (src.marker) {
                        visibleMarkers.push(src.marker);
                        map.removeLayer(src.marker);
                        src.marker.addTo(map);
                    }
                }
            }
            
            if (hashes.length > 0) {
                const pathNodes = this.validatePath(hashes, src);
                for (const node of pathNodes) {
                    // Only add nodes with valid coordinates (not zero)
                    if (node.adv && node.adv.data && node.adv.data.lat != 0 && node.adv.data.lon != 0) {
                        last.push([node.adv.data.lat, node.adv.data.lon]);
                        if (node.marker) {
                            visibleMarkers.push(node.marker);
                            map.removeLayer(node.marker);
                            node.marker.addTo(map);
                        }
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

                if (offset !== 0) {
                    // For offset lines, use straight polylines as offset doesn't work well with curved paths
                    layers.push(L.polyline([prev, current], {
                        color: 'rgba(255, 255, 255, 0.8)',
                        weight: lnOutline,
                        offset: offset,
                        opacity: 0.6
                    }));
                    layers.push(L.polyline([prev, current], {
                        color: color,
                        weight: lnWeight,
                        offset: offset,
                        opacity: 0.9
                    }));
                } else {
                    // For non-offset lines, use curved paths
                    const curvedPath = createCurvedPath(prev, current, 0.08);
                    layers.push(L.polyline(curvedPath, {
                        color: 'rgba(255, 255, 255, 0.8)',
                        weight: lnOutline,
                        opacity: 0.6,
                        smoothFactor: 1.0
                    }));
                    layers.push(L.polyline(curvedPath, {
                        color: color,
                        weight: lnWeight,
                        opacity: 0.9,
                        smoothFactor: 1.0
                    }));
                }
            }

            const lastHop = last[last.length - 1];
            // Only draw to destination if it has valid coordinates (not zero)
            if (dst.data.lat == 0 && dst.data.lon == 0) {
                // Destination has zero coordinates, skip drawing the final segment
                if (layers.length > 0) {
                    this.map_layers[id] = L.layerGroup(layers).addTo(map);
                    this.fadeMarkers();
                }
                return;
            }
            const current = [dst.data.lat, dst.data.lon];
            
            const pairId = `${lastHop[0]}-${lastHop[1]}_${current[0]}-${current[1]}`;
            if (!linkPairs.hasOwnProperty(pairId)) {
                linkPairs[pairId] = 0;
            }

            let offset = Math.floor((linkPairs[pairId] + 1) / 2) * lnOffset;
            if (offset > lnMaxOffsets) offset = 0;
            offset *= linkPairs[pairId] % 2 === 0 ? 1 : -1;

            linkPairs[pairId]++;

            if (offset !== 0) {
                // For offset lines, use straight polylines as offset doesn't work well with curved paths
                layers.push(L.polyline([lastHop, current], {
                    color: 'rgba(255, 255, 255, 0.8)',
                    weight: lnOutline,
                    offset: offset,
                    opacity: 0.6
                }));
                layers.push(L.polyline([lastHop, current], {
                    color: color,
                    weight: lnWeight,
                    offset: offset,
                    opacity: 0.9
                }));
            } else {
                // For non-offset lines, use curved paths
                const curvedPath = createCurvedPath(lastHop, current, 0.25);
                layers.push(L.polyline(curvedPath, {
                    color: 'rgba(255, 255, 255, 0.8)',
                    weight: lnOutline,
                    opacity: 0.6,
                    smoothFactor: 1.0
                }));
                layers.push(L.polyline(curvedPath, {
                    color: color,
                    weight: lnWeight,
                    opacity: 0.9,
                    smoothFactor: 1.0
                }));
            }
        }

        this.map_layers[id] = L.layerGroup(layers).addTo(map);
        this.fadeMarkers();
    }

    hidePath(id) {
        // Cancel any pending render for this path
        if (this.pathRenderTimers[id]) {
            clearTimeout(this.pathRenderTimers[id]);
            delete this.pathRenderTimers[id];
        }
        
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

                if (this.dom_favicon) {
                    this.dom_favicon.setAttribute('href','faviconr.ico');
                }
                document.title = `(${count}) EmpireMesh Log`; 
            }
            // Update reporters list after new messages are loaded
            this.updateBotsList();
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
        this.new_messages = {};
        if (this.dom_favicon) {
            this.dom_favicon.setAttribute('href','faviconw.ico');
        }
        document.title = `EmpireMesh Log`; 
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

