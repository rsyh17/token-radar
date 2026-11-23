// Token Launch Radar: renders the board window.RADAR carries (written by the
// entry program beside this page), with search, category and chain filters,
// four sort orders, and a per-protocol detail view that shows the valuation
// arithmetic and the farm plan. No network, no framework.

const radar = window.RADAR;
const rows = radar.rows;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function money(v) {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v}`;
}
const pct = (v) => (v === null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`);
const factor = (v) => `×${v.toFixed(3)}`;

$('meta').textContent =
  `Snapshot: ${radar.source} · ${rows.length} pre-token protocols ranked · all ${radar.watchlist_size} watchlist protocols covered · ` +
  `${radar.traded_set_aside} protocols already trade a token and ${radar.products_set_aside} are products of traded tokens — both set aside.`;
$('model-text').textContent =
  `Traded protocols reveal what the market pays for a dollar of TVL in their category: the median market-cap-to-TVL ratio ` +
  `(across all categories here, ×${radar.global_multiple.median.toFixed(3)} from ${radar.global_multiple.peers} traded protocols). ` +
  `A pre-token protocol's implied value is its TVL times its category's median ratio, adjusted by three factors from its own record: ` +
  `momentum (its 7-day TVL change), longevity (whole years run with no token, worth +4% a year up to six), and breadth (+1.5% per extra chain, up to seven). ` +
  `Nothing is ranked by name or by hand: change the snapshot and the board rebuilds itself.`;

// ------------------------------------------------------------- the filters

const categories = [...new Set(rows.map((r) => r.category).filter(Boolean))].sort();
for (const c of categories) {
  const o = document.createElement('option');
  o.value = c;
  o.textContent = c;
  $('category').appendChild(o);
}
const chains = [...new Set(rows.flatMap((r) => r.chains))].sort();
for (const c of chains) {
  const o = document.createElement('option');
  o.value = c;
  o.textContent = c;
  $('chain').appendChild(o);
}

function visible() {
  const q = $('search').value.trim().toLowerCase();
  const cat = $('category').value;
  const chain = $('chain').value;
  const watchOnly = $('watchonly').checked;
  let list = rows.filter(
    (r) =>
      (q === '' || r.name.toLowerCase().includes(q)) &&
      (cat === '' || r.category === cat) &&
      (chain === '' || r.chains.includes(chain)) &&
      (!watchOnly || r.on_watchlist),
  );
  const sort = $('sort').value;
  if (sort === 'tvl') list = [...list].sort((a, b) => b.tvl_usd - a.tvl_usd);
  if (sort === 'change') list = [...list].sort((a, b) => (b.change_7d ?? -1e9) - (a.change_7d ?? -1e9));
  if (sort === 'years') list = [...list].sort((a, b) => (b.years_tokenless ?? -1) - (a.years_tokenless ?? -1));
  return list;
}

function render() {
  const list = visible();
  $('count').textContent = `${list.length} of ${rows.length} protocols`;
  $('rows').innerHTML = list
    .map(
      (r) => `<tr data-slug="${esc(r.slug)}">
        <td class="rank">${r.rank}</td>
        <td class="pname">${esc(r.name)}${r.on_watchlist ? '<span class="watch">WATCHLIST</span>' : ''}</td>
        <td>${esc(r.category ?? '—')}</td>
        <td class="chains">${esc(r.chains.slice(0, 3).join(', '))}${r.chains.length > 3 ? ` +${r.chains.length - 3}` : ''}</td>
        <td class="num">${money(r.tvl_usd)}</td>
        <td class="num ${r.change_7d === null ? '' : r.change_7d >= 0 ? 'up' : 'down'}">${pct(r.change_7d)}</td>
        <td class="num">${r.years_tokenless === null ? '—' : r.years_tokenless}</td>
        <td class="num">×${r.multiple.toFixed(3)}</td>
        <td class="num value">${money(r.implied_value_usd)}</td>
      </tr>`,
    )
    .join('');
  for (const tr of $('rows').querySelectorAll('tr')) {
    tr.addEventListener('click', () => showDetail(tr.dataset.slug));
  }
}

// ------------------------------------------------------------- the detail

function showDetail(slug) {
  const r = rows.find((x) => x.slug === slug);
  if (!r) return;
  $('detail-body').innerHTML = `
    <h2>${esc(r.name)}</h2>
    <p class="sub">Rank #${r.rank} · ${esc(r.category ?? 'Uncategorised')} · ${esc(r.chains.join(', '))}${r.on_watchlist ? ' · on the house watchlist' : ''}</p>
    <div class="big">${money(r.implied_value_usd)}</div>
    <div class="big-label">Implied launch value</div>
    <div class="formula">
      TVL <b>${money(r.tvl_usd)}</b> × category multiple <b>×${r.multiple.toFixed(3)}</b>
      (${esc(r.multiple_category)}, ${r.multiple_peers} traded peers)<br>
      × momentum <b>${factor(r.momentum_factor)}</b> (7-day TVL ${pct(r.change_7d)})
      × longevity <b>${factor(r.longevity_factor)}</b> (${r.years_tokenless === null ? 'listing date unreported' : `${r.years_tokenless} years with no token`})
      × breadth <b>${factor(r.breadth_factor)}</b> (${r.chains.length} chain${r.chains.length === 1 ? '' : 's'})
    </div>
    <div class="stats">
      <div><span>TVL</span>${money(r.tvl_usd)}</div>
      <div><span>7-day change</span>${pct(r.change_7d)}</div>
      <div><span>Tracked since</span>${esc(r.listed_at ?? 'unreported')}</div>
      <div><span>Token</span>none recorded in the snapshot</div>
    </div>
    <h3>How to farm it</h3>
    <ol>${r.farm_steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`;
  $('detail').hidden = false;
}

$('close').addEventListener('click', () => {
  $('detail').hidden = true;
});
for (const id of ['search', 'category', 'chain', 'watchonly', 'sort']) {
  $(id).addEventListener('input', render);
  $(id).addEventListener('change', render);
}
render();
