<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes, viewport-fit=cover">
    <link id="favicon" rel="icon" type="image/x-icon" href="faviconw.ico">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
        crossorigin=""/>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
        integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="
        crossorigin=""></script>
    <script src=" https://cdn.jsdelivr.net/npm/leaflet-polylineoffset@1.1.1/leaflet.polylineoffset.min.js "></script>
    <script src="meshlog.js"></script>
    <link rel="stylesheet" href="style.css">
    <title>EmpireMesh Log</title>
</head>
<body>

<div id="container">
<div id="leftbar">
    <div class="settings" id="settings-types">
    </div>
    <div class="settings" id="settings-bots">
        <div class="settings-header" onclick="toggleReportersSection()">
            <span>Reporters</span>
            <span id="reporters-toggle" class="toggle-icon">▶</span>
        </div>
        <div id="bots-list" class="bots-list" style="display: none;">
            <div class="bots-loading">Loading bots...</div>
        </div>
    </div>
    <div class="settings" id="settings-translation">
        <div class="settings-header" onclick="toggleTranslationSection()">
            <span>Translation Settings</span>
            <span id="translation-toggle" class="toggle-icon">▶</span>
        </div>
        <div class="translation-controls" id="translation-controls" style="display: none;">
            <div class="translation-help">
                Press T next to a message to translate it
            </div>
            <div class="translation-row">
                <label>From:</label>
                <select id="translation-from">
                    <option value="auto">Auto-detect</option>
                    <option value="sk" selected>Slovak</option>
                    <option value="hu">Hungarian</option>
                    <option value="en">English</option>
                    <option value="de">German</option>
                    <option value="cs">Czech</option>
                    <option value="pl">Polish</option>
                    <option value="ro">Romanian</option>
                </select>
            </div>
            <div class="translation-row">
                <label>To:</label>
                <select id="translation-to">
                    <option value="sk">Slovak</option>
                    <option value="hu" selected>Hungarian</option>
                    <option value="en">English</option>
                    <option value="de">German</option>
                    <option value="cs">Czech</option>
                    <option value="pl">Polish</option>
                    <option value="ro">Romanian</option>
                </select>
            </div>
            <div class="translation-row">
                <input type="checkbox" id="translation-enabled" checked>
                <label for="translation-enabled">Enable Translation</label>
            </div>
            <div class="translation-row">
                <button id="reset-all-translations" class="reset-btn">All to Original</button>
            </div>
        </div>
    </div>
    <div id="logs"></div>
</div>
<div id="midbar">
    <div class="resize-bar" id="leftdrag"></div>
    <div id="map"></div>
    <div id="warning" hidden></div>
    <div class="resize-bar" id="rightdrag"></div>
</div>
<div id="rightbar">
    <div class="settings" id="settings-contacts">
    </div>
    <div class="settings" id="about">EmpireMesh Web v1867 <span>forked from <a href="https://github.com/Anrijs/Meshlog" target="_blank" rel="noopener noreferrer">Anrijs/Meshlog</a></span></div>
    <div id="contacts"></div>
</div>
</div>
<script>

// resize bars

class Bar {
    constructor(id, width) {
        this.tmpWidth = undefined;
        this.dom = document.getElementById(id);
        this.setWidth(width);
    }

    setWidth(w) {
        this.width = w;
        this.dom.style.width = `${w}%`;
    }

    setTmpWidth(w) {
        if (this.tmpWidth == undefined) {
            this.tmpWidth = this.width;
            this.setWidth(w);
        }
    }

    resetWidth() {
        if (this.tmpWidth != undefined) {
            this.setWidth(this.tmpWidth);
            this.tmpWidth = undefined;
        }
    }
}

class Drags {
    constructor(id) {
        this.pairs = [];
        this.container = document.getElementById(id);

        const self = this;

        this.container.addEventListener("mousemove", function (e) {
            e.preventDefault();

            let pair = undefined;
            for (var i=0;i<self.pairs.length;i++) {
                if (self.pairs[i].drag) {
                    pair = self.pairs[i];
                    break;
                }
            }

            if (!pair) return;

            let split = ( e.x - pair.x0) / pair.width;

            if (split < 0.05) split = 0.05;

            let ppLeft = pair.sum * split; // % left
            let ppRight = pair.sum - ppLeft;

            pair.left.setWidth(ppLeft);
            pair.right.setWidth(ppRight);
        });

        this.container.addEventListener("mouseup", function (e) {
            self.cancelDrag();
            map.invalidateSize();
        });
    }

    add(pair) {
        pair.bind(this);
        this.pairs.push(pair);
    }

    cancelDrag() {
        for (var i=0;i<this.pairs.length;i++) {
            this.pairs[i].drag = false;
        }
    }

    isDraging() {
        for (var i=0;i<this.pairs.length;i++) {
            if (this.pairs[i].drag) return true;
        }
        return false;
    }
}

class DragPair {
    constructor(id, left, right) {
        this.drag = false;
        this.left = left;
        this.right = right;
        this.bar = document.getElementById(id);
        this.calc();

        const self = this;

        this.bar.addEventListener("mousedown", function (e) {
            if (self.drags) self.drags.cancelDrag();
            self.calc();
            self.drag = true;
        });
    }

    calc() {
        this.x0 = this.left.dom.getBoundingClientRect().left;
        this.x1 = this.right.dom.getBoundingClientRect().right;
        this.width = this.x1 - this.x0;

        this.sum = this.percent2num(this.left.dom.style.width) + this.percent2num(this.right.dom.style.width);
    }

    percent2num(percent) {
        return parseFloat(percent.replaceAll("%","").trim());
    }

    bind(drags) {
        this.drags = drags;
    }
}

const leftBar = new Bar("leftbar", 33);
const middleBar = new Bar("midbar", 47);
const rightBar = new Bar("rightbar", 20);

const dragLeft = new DragPair("leftdrag", leftBar, middleBar);
const dragRight = new DragPair("rightdrag", middleBar, rightBar);

function resize() {
    if (window.innerWidth <= 900) {
        leftBar.setTmpWidth(100);
        middleBar.setTmpWidth(100);
        rightBar.setTmpWidth(100);
    } else {
        leftBar.resetWidth();
        middleBar.resetWidth();
        rightBar.resetWidth();
    }
}

window.addEventListener("resize", function() {
    resize();
});

const drags = new Drags("container");
drags.add(dragLeft);
drags.add(dragRight);

resize();

const formatedTimestamp = (d=new Date())=> {
  const date = d.toISOString().split('T')[0];
  const time = d.toTimeString().split(' ')[0];
  return `${date} ${time}`
}

// Detect mobile for performance optimizations
const isMobile = window.innerWidth <= 900;

var map = L.map('map', {
    preferCanvas: isMobile, // Use canvas rendering on mobile for better performance
    zoomAnimation: !isMobile, // Disable zoom animation on mobile
    markerZoomAnimation: !isMobile, // Disable marker animation on mobile
    fadeAnimation: !isMobile, // Disable fade animation on mobile
    zoomControl: true,
    doubleClickZoom: true,
    boxZoom: false,
    keyboard: true,
    scrollWheelZoom: true,
    tap: true,
    touchZoom: true
}).setView([47.1, 19.5], 8);

// Create single tile layer (OpenStreetMap)
var mapTileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    updateWhenZooming: !isMobile,
    updateWhenIdle: isMobile
});

// Detect system theme preference
function getSystemTheme() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
    }
    return 'light';
}

// Load saved map theme preference, or use system preference as default
var mapTheme = localStorage.getItem('mapTheme');
if (!mapTheme) {
    mapTheme = getSystemTheme();
}
mapTileLayer.addTo(map);

// Apply dark mode filter if needed
function applyMapTheme(theme) {
    var mapContainer = document.getElementById('map');
    if (theme === 'dark') {
        mapContainer.classList.add('map-dark-mode');
    } else {
        mapContainer.classList.remove('map-dark-mode');
    }
}

applyMapTheme(mapTheme);

// Listen for system theme changes and update if no manual preference is saved
if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
        // Only auto-update if user hasn't manually set a preference
        if (!localStorage.getItem('mapTheme')) {
            mapTheme = e.matches ? 'dark' : 'light';
            applyMapTheme(mapTheme);
        }
    });
}

// Map theme toggle control
L.Control.MapTheme = L.Control.extend({
    onAdd: function(mapInstance) {
        var container = L.DomUtil.create('div', 'leaflet-control-map-theme');
        container.innerHTML = '<button id="map-theme-toggle" title="Toggle map theme">🌓</button>';
        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.on(container, 'click', function() {
            mapTheme = mapTheme === 'light' ? 'dark' : 'light';
            localStorage.setItem('mapTheme', mapTheme);
            applyMapTheme(mapTheme);
        });
        return container;
    }
});

L.control.mapTheme = function(opts) {
    return new L.Control.MapTheme(opts);
};

L.control.mapTheme({ position: 'topright' }).addTo(map);

// Debounce zoom/move events on mobile to prevent freezing
let zoomUpdateTimeout = null;
let moveUpdateTimeout = null;

if (isMobile) {
    map.on('zoomstart', function() {
        // Clear any pending updates
        if (zoomUpdateTimeout) {
            clearTimeout(zoomUpdateTimeout);
        }
    });
    
    map.on('zoomend', function() {
        // Debounce invalidateSize to prevent multiple rapid calls
        if (zoomUpdateTimeout) {
            clearTimeout(zoomUpdateTimeout);
        }
        zoomUpdateTimeout = setTimeout(function() {
            map.invalidateSize();
        }, 100);
    });
    
    map.on('moveend', function() {
        // Debounce moveend updates
        if (moveUpdateTimeout) {
            clearTimeout(moveUpdateTimeout);
        }
        moveUpdateTimeout = setTimeout(function() {
            // Any moveend-specific updates can go here
        }, 150);
    });
}

var meshlog = new MeshLog(
    map,
    "logs",
    "contacts",
    "settings-types",
    null,
    "settings-contacts"
);
meshlog.loadAll();
meshlog.setAutorefresh(10000);

function showWarning(msg) {
    let warn = document.getElementById("warning");
    warn.innerText = msg;
    if (msg.length > 0) {
        warn.hidden = false;
    } else {
        warn.hidden = true;
    }
}

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

function toggleReportersSection() {
    const list = document.getElementById("bots-list");
    const toggle = document.getElementById("reporters-toggle");
    
    if (list.style.display === "none") {
        list.style.display = "block";
        toggle.innerText = "▼";
    } else {
        list.style.display = "none";
        toggle.innerText = "▶";
    }
}

</script>
</body>
</html>
