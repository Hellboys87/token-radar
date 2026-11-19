// Token Radar dashboard — renders window.RADAR, no network, no fetch.
// Views: board (?view=board), detail (?view=detail&slug=…), live (?view=live),
// model (?view=model). Board filters: ?q=… ?cat=… ?chain=… ?wl=1, sorting
// with ?sort=<key>&dir=asc|desc. Clicking a header or a row updates the URL.
(function () {
  'use strict';
  var R = window.RADAR;
  var app = document.getElementById('app');
  var foot = document.getElementById('foot');
  var tabsEl = document.getElementById('tabs');
  if (!R) { app.innerHTML = '<p class="empty">No radar data found (data.js did not load).</p>'; return; }

  var wl = {};
  (R.watchlist || []).forEach(function (s) { wl[s] = true; });

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    if (n == null) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function pct(n) {
    if (n == null) return '—';
    var cls = n > 0 ? 'up' : n < 0 ? 'down' : '';
    return '<span class="' + cls + '">' + (n > 0 ? '+' : '') + n.toFixed(1) + '%</span>';
  }
  function age(n) { return n == null ? '—' : n >= 365 ? (n / 365).toFixed(1) + 'y' : n + 'd'; }
  // The board's signal for one row, derived live from its own figures:
  // a strong week first, then a long record, then an early find.
  function signal(r) {
    if (r.change_7d != null && r.change_7d >= 5) return 'MOMENTUM';
    if (r.age_days != null && r.age_days >= 730) return 'ESTABLISHED';
    if (r.tvl_usd < R.floor_usd) return 'EARLY FIND';
    return 'STEADY';
  }
  function params() { return new URLSearchParams(location.search); }
  function go(p) { location.search = p.toString(); }
  function link(view, extra) {
    var p = new URLSearchParams();
    p.set('view', view);
    if (extra) Object.keys(extra).forEach(function (k) { if (extra[k]) p.set(k, extra[k]); });
    return '?' + p.toString();
  }

  var cats = [], chains = [];
  R.rows.forEach(function (r) {
    if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category);
    r.chains.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
  });
  cats.sort(); chains.sort();

  var TABS = [['board', 'Board'], ['live', 'Live token'], ['model', 'How the model works']];
  var view = params().get('view') || 'board';
  if (['board', 'live', 'model', 'detail'].indexOf(view) < 0) view = 'board';
  tabsEl.innerHTML = TABS.map(function (t) {
    return '<a href="' + link(t[0]) + '"' + (view === t[0] || (view === 'detail' && t[0] === 'board') ? ' class="on"' : '') + '>' + t[1] + '</a>';
  }).join('');

  foot.textContent = 'Data: DefiLlama snapshot as of ' + R.as_of + ' (' + R.source + '). ' +
    '“Pre-token” means the snapshot records no token for the protocol — not proof it has none. ' +
    'Implied values are this radar’s own claim, never make.fun’s. Model ' + R.model_version + '.';

  // ---------------------------------------------------------- board view
  var SORTS = {
    rank: function (a, b) { return a.rank - b.rank; },
    name: function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; },
    tvl: function (a, b) { return b.tvl_usd - a.tvl_usd; },
    chg: function (a, b) { return (b.change_7d == null ? -1e9 : b.change_7d) - (a.change_7d == null ? -1e9 : a.change_7d); },
    age: function (a, b) { return (b.age_days == null ? -1 : b.age_days) - (a.age_days == null ? -1 : a.age_days); },
    value: function (a, b) { return b.implied_value_usd - a.implied_value_usd; },
  };

  function renderBoard() {
    var p = params();
    var q = (p.get('q') || '').toLowerCase();
    var cat = p.get('cat') || '';
    var chain = p.get('chain') || '';
    var wlOnly = p.get('wl') === '1';
    var gainOnly = p.get('gain') === '1';
    var sort = SORTS[p.get('sort')] ? p.get('sort') : 'rank';
    var dir = p.get('dir') === 'desc' ? -1 : 1;

    var rows = R.rows.filter(function (r) {
      if (wlOnly && !wl[r.slug]) return false;
      if (gainOnly && !(r.change_7d != null && r.change_7d > 0)) return false;
      if (cat && r.category !== cat) return false;
      if (chain && r.chains.indexOf(chain) < 0) return false;
      if (q && (r.name.toLowerCase().indexOf(q) < 0 && r.slug.indexOf(q) < 0 && (r.category || '').toLowerCase().indexOf(q) < 0)) return false;
      return true;
    });
    rows = rows.slice().sort(function (a, b) { return SORTS[sort](a, b) * dir; });

    function th(key, label, num) {
      var arrow = sort === key ? (dir === 1 ? ' ▲' : ' ▼') : '';
      return '<th class="sortable' + (sort === key ? ' sorted' : '') + (num ? ' num' : '') +
        '" data-sort="' + key + '">' + label + arrow + '</th>';
    }
    var h = '<div class="stats">' +
      stat(R.board_size, 'protocols ranked') + stat(R.watchlist_size, 'on the watchlist') +
      stat(R.early_size, 'early finds below the floor') + stat(money(topValue()), 'top implied value') +
      stat(R.as_of, 'snapshot date') + '</div>';
    h += '<div class="controls">' +
      '<input type="search" id="q" placeholder="Search name, slug or category…" value="' + esc(p.get('q') || '') + '">' +
      '<select id="cat"><option value="">All categories</option>' + cats.map(function (c) {
        return '<option' + (c === cat ? ' selected' : '') + '>' + esc(c) + '</option>';
      }).join('') + '</select>' +
      '<select id="chain"><option value="">All chains</option>' + chains.map(function (c) {
        return '<option' + (c === chain ? ' selected' : '') + '>' + esc(c) + '</option>';
      }).join('') + '</select>' +
      '<label><input type="checkbox" id="wl"' + (wlOnly ? ' checked' : '') + '> Watchlist only</label>' +
      '<label><input type="checkbox" id="gain"' + (gainOnly ? ' checked' : '') + '> Gainers only (7d &gt; 0)</label></div>';
    h += '<p class="count">Showing <b>' + rows.length + '</b> of ' + R.board_size +
      ' ranked protocols. Click a row for its detail and farm plan; click a header to sort.</p>';
    h += '<table><thead><tr>' + th('rank', '#') + th('name', 'Protocol') + th('tvl', 'TVL', 1) +
      th('chg', '7d', 1) + th('age', 'Age', 1) + th('value', 'Implied value', 1) + '</tr></thead><tbody>';
    if (!rows.length) h += '<tr><td colspan="6" class="empty">Nothing matches these filters.</td></tr>';
    rows.forEach(function (r) {
      h += '<tr data-slug="' + esc(r.slug) + '"><td class="num">' + r.rank + '</td>' +
        '<td><span class="name">' + esc(r.name) + '</span>' + (wl[r.slug] ? '<span class="badge">WATCHLIST</span>' : '') +
        '<span class="badge sig">' + signal(r) + '</span>' +
        '<br><span class="slug">' + esc(r.slug) + ' · ' + esc(r.category || 'Uncategorized') + '</span></td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + age(r.age_days) + '</td>' +
        '<td class="num val">' + money(r.implied_value_usd) + '</td></tr>';
    });
    h += '</tbody></table>';
    app.innerHTML = h;

    function apply() {
      var np = new URLSearchParams();
      np.set('view', 'board');
      var qv = document.getElementById('q').value.trim();
      var cv = document.getElementById('cat').value;
      var hv = document.getElementById('chain').value;
      if (qv) np.set('q', qv);
      if (cv) np.set('cat', cv);
      if (hv) np.set('chain', hv);
      if (document.getElementById('wl').checked) np.set('wl', '1');
      if (document.getElementById('gain').checked) np.set('gain', '1');
      if (sort !== 'rank') { np.set('sort', sort); if (dir === -1) np.set('dir', 'desc'); }
      go(np);
    }
    document.getElementById('q').addEventListener('change', apply);
    document.getElementById('cat').addEventListener('change', apply);
    document.getElementById('chain').addEventListener('change', apply);
    document.getElementById('wl').addEventListener('change', apply);
    document.getElementById('gain').addEventListener('change', apply);
    app.querySelectorAll('th.sortable').forEach(function (el) {
      el.addEventListener('click', function () {
        var k = el.getAttribute('data-sort');
        var np = params();
        if (sort === k) np.set('dir', dir === 1 ? 'desc' : 'asc');
        else { np.set('sort', k); np.delete('dir'); }
        go(np);
      });
    });
    app.querySelectorAll('tr[data-slug]').forEach(function (el) {
      el.addEventListener('click', function () { location.search = link('detail', { slug: el.getAttribute('data-slug') }); });
    });
  }
  function stat(v, label) { return '<div class="stat"><b>' + esc(v) + '</b><span>' + esc(label) + '</span></div>'; }
  function topValue() { return R.rows.length ? R.rows[0].implied_value_usd : 0; }

  // ---------------------------------------------------------- detail view
  function renderDetail() {
    var slug = params().get('slug') || '';
    var r = null;
    R.rows.forEach(function (x) { if (x.slug === slug) r = x; });
    if (!r) { app.innerHTML = '<p class="empty">No protocol “' + esc(slug) + '” on this board. <a class="back" href="' + link('board') + '">Back to the board</a></p>'; return; }
    var m = R.model;
    var h = '<p><a class="back" href="' + link('board') + '">← Back to the board</a></p>';
    h += '<div class="card"><h2>#' + r.rank + ' ' + esc(r.name) + (wl[r.slug] ? ' <span class="badge">WATCHLIST</span>' : '') + '</h2>' +
      '<p class="sub">' + esc(r.slug) + ' · ' + esc(r.category || 'Uncategorized') + ' · ' +
      r.chains.map(function (c) { return '<span class="pill">' + esc(c) + '</span>'; }).join(' ') + '</p>' +
      '<div class="grid">' +
      cell(money(r.tvl_usd), 'TVL') + cell(pct(r.change_7d), 'TVL change, 7 days') +
      cell(age(r.age_days), 'Tracked since ' + (r.listed_at || 'unknown')) +
      cell(money(r.implied_value_usd), 'Implied value') + '</div>' +
      '<h3>How impliedValue gets ' + money(r.implied_value_usd) + '</h3>' +
      '<div class="formula">base = TVL × anchor = ' + money(r.tvl_usd) + ' × ' + r.anchor.toFixed(3) + ' = <b>' + money(r.base_usd) + '</b><br>' +
      'growthMultiplier(' + r.growth_pct.toFixed(1) + '% 7d, 1 + ' + m.growth_weight + ' × tanh(change/' + m.growth_scale_pct + ')) = <b>' + r.growth_multiplier.toFixed(3) + '</b><br>' +
      'maturityMultiplier(' + age(r.age_days) + ', 0.55 + 0.45 × (1 − e^(−age/540))) = <b>' + r.maturity_multiplier.toFixed(3) + '</b><br>' +
      'chainMultiplier(' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + ', +0.03 each, capped +0.30) = <b>' + r.chain_multiplier.toFixed(3) + '</b><br>' +
      'implied = base × growth × maturity × chains = <b>' + money(r.implied_value_usd) + '</b></div>' +
      '<p class="note">The anchor starts from the median mcap/TVL of the ' + r.anchor_samples + ' live protocols in the “' + esc(r.category || 'Uncategorized') +
      '” category (median ' + r.anchor_median.toFixed(3) + ') and is shrunk toward the market-wide median ' + R.global_anchor.toFixed(3) +
      ' by sample count — (n × median + ' + m.anchor_shrinkage + ' × global) / (n + ' + m.anchor_shrinkage + '), or the global median outright under ' +
      m.category_min_samples + ' samples — then clamped to ' + m.anchor_min + '–' + m.anchor_max +
      '. Signal: ' + signal(r) + '. The snapshot records no token for this protocol.</p></div>';
    h += '<div class="card"><h3>Farm plan — ' + r.farm_steps.length + ' steps</h3><ol class="farm">' +
      r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol></div>';
    app.innerHTML = h;
  }
  function cell(v, label) { return '<div class="cell"><b>' + v + '</b><span>' + esc(label) + '</span></div>'; }

  // ---------------------------------------------------------- live view
  function renderLive() {
    var h = '<div class="card"><h2>Live token — the market’s own values</h2>' +
      '<p class="sub">These protocols already trade, so the radar never ranks them by a model. ' +
      'Their market cap is shown as-is; the mcap/TVL ratio is the anchor the model learns from.</p></div>';
    h += '<table><thead><tr><th>Protocol</th><th class="num">TVL</th><th class="num">Market cap</th>' +
      '<th class="num">Mcap / TVL</th><th class="num">7d</th></tr></thead><tbody>';
    R.live.forEach(function (r) {
      h += '<tr><td><span class="name">' + esc(r.name) + '</span><br><span class="slug">' + esc(r.slug) +
        ' · ' + esc(r.category || 'Uncategorized') + '</span></td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td><td class="num">' + money(r.mcap_usd) + '</td>' +
        '<td class="num">' + (r.mcap_per_tvl == null ? '—' : r.mcap_per_tvl.toFixed(3)) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td></tr>';
    });
    h += '</tbody></table>';
    app.innerHTML = h;
  }

  // ---------------------------------------------------------- model view
  function renderModel() {
    var m = R.model;
    var h = '<div class="card"><h2>How the model works</h2>' +
      '<p class="sub">Model <b>' + esc(R.model_version) + '</b>. Every input is a figure from the sealed DefiLlama snapshot of ' +
      R.as_of + '; no protocol name is ever special-cased.</p>' +
      '<div class="formula">impliedValue = TVL × anchor × growthMultiplier × maturityMultiplier × chainMultiplier</div>' +
      '<ol class="farm">' +
      '<li><b>anchor</b> — the median market-cap/TVL ratio of the live protocols in the same category, shrunk toward the market-wide median ' + R.global_anchor.toFixed(3) + ' by sample count: (n × category median + ' + m.anchor_shrinkage + ' × global) / (n + ' + m.anchor_shrinkage + '), with the global median outright under ' + m.category_min_samples + ' samples, clamped to ' + m.anchor_min + '–' + m.anchor_max + '. A category priced by three protocols barely moves off the market median; one priced by forty stands on its own.</li>' +
      '<li><b>growthMultiplier</b> — 1 + ' + m.growth_weight + ' × tanh(change_7d / ' + m.growth_scale_pct + '). Weekly TVL changes are noisy — this snapshot holds a +4,448% week — so the curve saturates: a real trend moves the value (about +10% at +5.6% growth), and no single week, however freakish, adds or removes more than ' + (m.growth_weight * 100).toFixed(0) + '%.</li>' +
      '<li><b>maturityMultiplier</b> — ' + m.maturity_floor + ' + ' + m.maturity_range + ' × (1 − e^(−age/' + m.maturity_halflife_days + ')). Older protocols earn more of the multiple, with diminishing returns; unknown age counts as ' + m.unknown_age_multiplier + '×.</li>' +
      '<li><b>chainMultiplier</b> — 1 + ' + m.chain_bonus + ' per extra chain, capped at +' + (m.chain_bonus * m.chain_bonus_cap).toFixed(2) + '. TVL spread across chains is harder to fake and easier to farm.</li>' +
      '<li><b>who is ranked</b> — a protocol is ranked only when the snapshot records no token for it and it is not a wrapped, staked or bridged product of a token that already trades: categories like Bridge and Liquid Staking, names carrying the whole word wrapped, staked or staking, names beginning with an exchange’s name, and versioned pools are all left out, because WBTC is Bitcoin in a wrapper, not a launch still to come.</li>' +
      '</ol></div>' +
      '<div class="card"><h3>The board</h3><p class="sub">All ' + R.watchlist_size + ' watchlist protocols (TVL ≥ ' + money(R.floor_usd) +
      ', no token recorded) plus every other rankable pre-token protocol below the floor — ' + R.early_size + ' early finds, ' + R.board_size +
      ' rows in all, with no TVL shortlist cutting the small ones before the model scores them. Each row carries a signal — Momentum, Established, Early find or Steady — read from its own figures. Live-token protocols sit apart in the Live token view, priced by the market, never by this model.</p></div>';
    app.innerHTML = h;
  }

  if (view === 'detail') renderDetail();
  else if (view === 'live') renderLive();
  else if (view === 'model') renderModel();
  else renderBoard();
  app.setAttribute('aria-busy', 'false');
})();
