<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link id="favicon" rel="icon" type="image/x-icon" href="faviconw.ico">
    <title>Collision Helper - EmpireMesh</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #1a1a1a; color: #ddd; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        .subtitle { color: #888; font-size: 13px; margin-bottom: 16px; }
        .stats { color: #aaa; font-size: 13px; margin-bottom: 12px; }
        .stats span { font-weight: bold; }
        .legend { display: flex; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; font-size: 13px; }
        .legend-item { display: flex; align-items: center; gap: 6px; }
        .legend-swatch { width: 16px; height: 16px; border-radius: 3px; border: 1px solid #555; }
        .loading { text-align: center; padding: 40px; color: #888; }
        .error { text-align: center; padding: 40px; color: #ff6666; }

        .hex-grid { display: grid; grid-template-columns: repeat(16, 1fr); gap: 3px; max-width: 1000px; }
        .hex-cell {
            padding: 12px 8px; text-align: center; border: 1px solid #444; border-radius: 4px;
            font-size: 13px; font-weight: bold; cursor: default; transition: all 0.2s ease;
            min-height: 36px; display: flex; align-items: center; justify-content: center;
        }
        .hex-cell:hover { transform: scale(1.1); z-index: 10; position: relative; box-shadow: 0 2px 8px rgba(0,0,0,0.3); }
        .hex-cell.unoccupied { background: #2d4a2d; color: #4a7c4a; border-color: #4a7c4a; }
        .hex-cell.unoccupied:hover { background: #3d5a3d; border-color: #5a8c5a; }
        .hex-cell.occupied { background: #4a2d2d; color: #d4a5a5; border-color: #8c5a5a; }
        .hex-cell.occupied:hover { background: #5a3d3d; border-color: #9c6a6a; }
        .hex-cell.colliding { background: #1a1a1a; color: #ffcc00; border-color: #666; }
        .hex-cell.colliding:hover { background: #2a2a2a; border-color: #777; }

        @media (max-width: 700px) {
            .hex-grid { grid-template-columns: repeat(8, 1fr); gap: 2px; }
            .hex-cell { padding: 8px 4px; font-size: 11px; min-height: 32px; }
        }
    </style>
</head>
<body>
    <h1>Collision Helper</h1>
    <div class="subtitle">Repeater ID allocation grid (01–FE)</div>
    <div class="stats" id="stats"></div>
    <div class="legend">
        <div class="legend-item"><div class="legend-swatch" style="background:#2d4a2d;border-color:#4a7c4a;"></div> Unoccupied</div>
        <div class="legend-item"><div class="legend-swatch" style="background:#4a2d2d;border-color:#8c5a5a;"></div> Occupied</div>
        <div class="legend-item"><div class="legend-swatch" style="background:#1a1a1a;border-color:#666;"></div> Colliding</div>
    </div>
    <div id="grid"><div class="loading">Loading repeaters...</div></div>

<script>
(async function() {
    const gridEl = document.getElementById('grid');
    const statsEl = document.getElementById('stats');

    try {
        const resp = await fetch('/api/v1/all?count=5000');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();

        let contacts = data.contacts?.objects || (Array.isArray(data.contacts) ? data.contacts : null) || (Array.isArray(data) ? data : null);
        if (!contacts) throw new Error('No contacts in response');

        // Group repeaters by 2-char hex ID prefix
        const repeaters = {};
        let total = 0;
        contacts.forEach(c => {
            if (c.advertisement?.type === 2 && c.public_key) {
                const id = c.public_key.substring(0, 2).toLowerCase();
                repeaters[id] = repeaters[id] || [];
                repeaters[id].push(c.advertisement.name || 'Unknown');
                total++;
            }
        });

        const occupiedCount = Object.keys(repeaters).length;
        const collidingCount = Object.values(repeaters).filter(v => v.length > 1).length;
        statsEl.innerHTML = `<span>${total}</span> repeaters, <span>${occupiedCount}</span> IDs occupied, <span>${collidingCount}</span> collisions, <span>${254 - occupiedCount}</span> free`;

        // Render grid
        gridEl.innerHTML = '';
        const grid = document.createElement('div');
        grid.className = 'hex-grid';

        for (let i = 1; i <= 254; i++) {
            const hex = i.toString(16).padStart(2, '0').toUpperCase();
            const cell = document.createElement('div');
            cell.className = 'hex-cell';
            cell.textContent = hex;

            const key = hex.toLowerCase();
            if (repeaters[key]) {
                if (repeaters[key].length > 1) {
                    cell.classList.add('colliding');
                    cell.title = `Colliding IDs:\n${repeaters[key].join('\n')}`;
                } else {
                    cell.classList.add('occupied');
                    cell.title = `Occupied by: ${repeaters[key][0]}`;
                }
            } else {
                cell.classList.add('unoccupied');
                cell.title = 'Unoccupied';
            }
            grid.appendChild(cell);
        }
        gridEl.appendChild(grid);
    } catch (e) {
        gridEl.innerHTML = `<div class="error">Failed to load: ${e.message}</div>`;
    }
})();
</script>
</body>
</html>
