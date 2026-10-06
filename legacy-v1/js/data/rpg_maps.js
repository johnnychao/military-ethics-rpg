/* Original chapter geography, independent of learner records and tactical rules.
 * Coordinates use the 16 × 20 exploration tile grid. Paths and zones are floor
 * treatments, never collision: only map.walls block movement. All new walls
 * are subsets of the original v1 walls, so every valid old position survives.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RPGMaps = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const point = ([x, y]) => ({ x, y });
  const wall = ([x, y, w, h, type = 'building']) => ({ x, y, w, h, type });
  const route = (id, points, width = 1.5, kind = 'stone') => ({ id, kind, width, points: points.map(point) });
  const zone = (x, y, w, h, kind, label) => ({ x, y, w, h, kind, label, walkable: true });
  const decoration = (x, y, kind, label = '') => ({ x, y, kind, label, walkable: true });
  // Theme colors are renderer hints, not a substitute for the distinct layouts.
  const theme = (id, name, subtitle, ground, path, accent, vegetation, sky, mood) => ({
    id, name, subtitle, ground, path, accent, vegetation, sky, mood,
    pathEdge: '#87917a', ink: '#203c42', light: '#fff0cc'
  });
  const definitions = [
    {
      id: 'u01',
      theme: theme('archive-court', '史料回字庭', '繞行史料石廊，找到被秩序漏掉的聲音', '#94a476', '#d9c5a3', '#bb794c', '#4b7451', '#e6dac3', 'warm'),
      summary: '中央回字石廊連接三座史料閱讀席，西南另有隊規頁支路。',
      walls: [[1, 2, 3, 1], [11, 3, 3, 2], [1, 9, 1, 3, 'trees'], [12, 8, 2, 1, 'crates']],
      paths: [route('cloister', [[4, 5], [10, 5], [10, 15], [4, 15], [4, 5]], 2),
        route('arrival', [[8, 17], [8, 15]], 2), route('archive-entry', [[8, 5], [8, 3]], 2),
        route('east-reading', [[10, 13], [12, 13]]), route('west-reading', [[4, 6], [3, 6]]),
        route('quiet-page', [[4, 15], [2, 15], [2, 16]])],
      zones: [zone(5, 7, 4, 6, 'mosaic', '將德與人和'), zone(2, 5, 3, 3, 'reading', '兵家席'), zone(10, 12, 4, 3, 'reading', '需求席')],
      decor: [decoration(6, 8, 'seal', '節制'), decoration(7, 11, 'seal', '人和'), decoration(5, 16, 'inlay'), decoration(10, 4, 'petals')],
      clues: [[3, 6], [12, 13], [5, 10]], side: [2, 16],
      bonus: { puzzle: [11, 17], egg: [2, 7], errand: [7, 12], order: [13, 6] }
    },
    {
      id: 'u02',
      theme: theme('service-exhibition', '服務展場雙環', '在試讀環與共設計環之間往返', '#7eac99', '#e3d0ac', '#e0a861', '#427c6a', '#c7e7dd', 'bright'),
      summary: '西側試讀環與東側共設計環交會，兩種服務準備各有閱讀與討論空間。',
      walls: [[1, 2, 2, 2], [12, 3, 2, 3], [1, 10, 2, 2, 'trees'], [12, 9, 2, 1, 'crates']],
      paths: [route('west-loop', [[4, 5], [8, 5], [8, 15], [4, 15], [4, 5]], 1.7),
        route('east-loop', [[10, 10], [14, 10], [14, 15], [10, 15], [10, 10]], 1.7),
        route('cross-exhibition', [[3, 8], [10, 8], [10, 10]]),
        route('arrival', [[8, 17], [8, 15], [12, 15]]), route('exit', [[8, 5], [8, 3]]),
        route('plain-language', [[8, 6], [9, 6]])],
      zones: [zone(5, 6, 2, 6, 'display', '試讀小環'), zone(11, 11, 3, 3, 'display', '共同設計環'), zone(5, 16, 6, 2, 'welcome', '服務入口')],
      decor: [decoration(6, 9, 'seal', '試'), decoration(11, 12, 'seal', '共'), decoration(5, 4, 'petals'), decoration(13, 16, 'inlay')],
      clues: [[3, 8], [12, 15], [9, 6]], side: [14, 12],
      bonus: { puzzle: [6, 13], egg: [14, 7], errand: [2, 16], order: [11, 17] }
    },
    {
      id: 'u03',
      theme: theme('training-green', '整備綠廊', '在熟悉的服務基地，練習可靠求助', '#77a966', '#d7c9a0', '#ffd476', '#347b50', '#d6e6bf', 'calm'),
      summary: '保留原始整備區格局：南門集合庭、中軸綠廊與東側候位站。',
      walls: [[1, 2, 3, 2], [11, 3, 3, 3], [1, 9, 2, 3, 'trees'], [12, 8, 2, 2, 'crates']],
      paths: [route('green-spine', [[8, 19], [8, 0]], 3), route('south-crossing', [[0, 15], [15, 15]], 2),
        route('north-crossing', [[0, 7], [15, 7]], 2), route('west-approach', [[5, 18], [5, 14]], 2),
        route('waiting-approach', [[8, 11], [12, 11]], 2)],
      zones: [zone(6, 17, 5, 3, 'assembly', '南門集合庭'), zone(3, 13, 3, 3, 'reading', '能力查核席'), zone(10, 10, 4, 3, 'waiting', '候位站')],
      decor: [decoration(6, 16, 'inlay'), decoration(10, 16, 'inlay'), decoration(6, 5, 'petals'), decoration(14, 14, 'petals')],
      clues: [[4, 14], [11, 11], [5, 6]], side: [12, 16],
      bonus: { puzzle: [3, 15], egg: [13, 18], errand: [6, 9], order: [4, 17] }
    },
    {
      id: 'u04',
      theme: theme('signal-corridor', '通訊折線廊', '沿備援訊號追查交接斷點', '#789792', '#b8c9b8', '#e7b564', '#466d62', '#bbcdd0', 'overcast'),
      summary: '西南接班處、中央折線通訊廊與東側待確認區，三個轉折表現訊息接力。',
      walls: [[1, 2, 3, 2], [11, 3, 2, 1], [13, 4, 1, 2], [2, 9, 1, 3, 'trees'], [12, 8, 1, 2, 'crates']],
      paths: [route('signal-relay', [[8, 17], [4, 17], [4, 12], [10, 12], [10, 7], [7, 7], [7, 3], [8, 3]], 2, 'slate'),
        route('handover-spur', [[10, 12], [10, 13], [13, 13]], 1.5, 'slate'),
        route('receipt-spur', [[7, 7], [6, 7]], 1.5, 'slate')],
      zones: [zone(3, 14, 3, 3, 'handover', '接班覆述區'), zone(8, 8, 3, 3, 'signal', '備援通訊區'), zone(11, 12, 4, 3, 'holding', '待確認區')],
      decor: [decoration(5, 16, 'signal', '收到'), decoration(9, 12, 'signal', '覆述'), decoration(8, 7, 'signal', '接手'), decoration(14, 13, 'stripe')],
      clues: [[4, 15], [10, 10], [6, 7]], side: [13, 13],
      bonus: { puzzle: [13, 16], egg: [3, 6], errand: [9, 5], order: [2, 14] }
    },
    {
      id: 'u05',
      theme: theme('civic-squares', '公共活動雙廣場', '連接原活動與獨立服務空間', '#b0a17a', '#e9d3a8', '#b97869', '#748052', '#ede1c5', 'sunlit'),
      summary: '上下兩座開放廣場以中軸相接，東側另有改址通知步道。',
      walls: [[1, 2, 1, 2], [11, 3, 3, 1], [1, 9, 2, 2, 'trees'], [13, 8, 1, 2, 'crates']],
      paths: [route('public-axis', [[8, 17], [8, 3]], 2.3, 'paving'),
        route('south-plaza', [[3, 14], [3, 15], [12, 15], [12, 14]], 2, 'paving'),
        route('north-plaza', [[5, 6], [12, 6], [12, 7]], 2, 'paving'),
        route('notice-walk', [[12, 15], [13, 15], [13, 17]], 1.5, 'paving'),
        route('transfer-walk', [[12, 7], [11, 7], [11, 14]], 1.3, 'paving')],
      zones: [zone(3, 5, 10, 4, 'plaza', '原活動廣場'), zone(3, 13, 10, 4, 'plaza', '獨立服務廣場'), zone(5, 10, 5, 2, 'mosaic', '公共任務')],
      decor: [decoration(4, 8, 'seal', '授權'), decoration(10, 16, 'seal', '服務'), decoration(13, 5, 'petals'), decoration(4, 13, 'petals')],
      clues: [[3, 14], [12, 7], [5, 6]], side: [13, 17],
      bonus: { puzzle: [5, 11], egg: [14, 12], errand: [2, 17], order: [9, 10] }
    },
    {
      id: 'u06',
      theme: theme('rotation-track', '輪值操演跑道', '在輪值環上找到休息與回報的位置', '#b8a17a', '#bd8067', '#f2d28d', '#7b8855', '#eed5b1', 'late-afternoon'),
      summary: '長方形輪值跑道包圍中央休息區，東側支援線直通整合入口。',
      walls: [[1, 2, 2, 1], [12, 3, 2, 2], [1, 9, 1, 2, 'trees'], [12, 8, 1, 1, 'crates']],
      paths: [route('rotation-loop', [[4, 4], [10, 4], [10, 16], [4, 16], [4, 4]], 2, 'track'),
        route('support-line', [[8, 17], [10, 17], [10, 4], [8, 4], [8, 3]], 1.5, 'track'),
        route('rest-access', [[4, 12], [7, 12], [10, 12]], 1.2, 'paving')],
      zones: [zone(5, 6, 4, 4, 'field', '能力操演場'), zone(5, 11, 4, 3, 'rest', '輪替休息席'), zone(11, 14, 3, 3, 'briefing', '備援簡報區')],
      decor: [decoration(5, 16, 'arrow', '輪值'), decoration(9, 5, 'arrow', '回報'), decoration(6, 12, 'seal', '休'), decoration(13, 16, 'stripe')],
      clues: [[4, 14], [10, 8], [4, 5]], side: [7, 12],
      bonus: { puzzle: [12, 16], egg: [2, 6], errand: [8, 8], order: [13, 12] }
    },
    {
      id: 'u07',
      theme: theme('supply-crossroads', '倉儲清點十字區', '將清點、傳聞與職掌分開查核', '#aaa38a', '#c9c2a3', '#c5a35f', '#647661', '#d6d3bd', 'workday'),
      summary: '中央清點十字路連接四個倉儲角落，南側有安靜說明區。',
      walls: [[1, 2, 3, 2, 'crates'], [11, 3, 3, 2, 'crates'], [1, 9, 2, 3, 'crates'], [12, 8, 2, 1, 'crates']],
      paths: [route('counting-spine', [[8, 17], [8, 3]], 2, 'concrete'),
        route('warehouse-cross', [[3, 11], [14, 11]], 2, 'concrete'),
        route('west-count', [[3, 11], [3, 13], [6, 13]], 1.5, 'concrete'),
        route('records-branch', [[8, 5], [6, 5]], 1.5, 'concrete'),
        route('quiet-branch', [[8, 17], [12, 17]], 1.5, 'concrete')],
      zones: [zone(4, 8, 3, 3, 'counting', '實物清點區'), zone(10, 10, 5, 3, 'holding', '事實與傳聞'), zone(10, 15, 4, 3, 'rest', '安靜說明區')],
      decor: [decoration(5, 9, 'grid', '核'), decoration(9, 11, 'arrow', '查'), decoration(6, 16, 'inlay'), decoration(14, 14, 'stripe')],
      clues: [[3, 13], [13, 11], [6, 5]], side: [12, 17],
      bonus: { puzzle: [5, 8], egg: [14, 17], errand: [9, 7], order: [4, 16] }
    },
    {
      id: 'u08',
      theme: theme('negotiation-triangle', '補給協商三角庭', '在條件、界線與替代之間比較', '#869b70', '#d9bd93', '#ce916e', '#566f46', '#ead9bf', 'warm'),
      summary: '階梯形三角迴廊把條件書、關係卡與替代補給席連成可比較的三端。',
      walls: [[2, 2, 2, 2], [11, 4, 3, 2], [1, 10, 1, 2, 'trees'], [13, 9, 1, 1, 'crates']],
      paths: [route('three-way-court', [[3, 14], [3, 12], [5, 12], [5, 10], [7, 10], [7, 6], [9, 6], [9, 10], [11, 10], [11, 12], [13, 12], [13, 14], [3, 14]], 1.7),
        route('arrival', [[8, 17], [8, 14]], 2), route('north-choice', [[8, 6], [8, 3]], 1.5),
        route('quiet-spur', [[5, 14], [5, 16]])],
      zones: [zone(2, 12, 3, 3, 'discussion', '條件席'), zone(10, 12, 4, 3, 'discussion', '關係席'), zone(6, 5, 4, 3, 'discussion', '替代席'), zone(6, 11, 4, 2, 'mosaic', '公共目的')],
      decor: [decoration(6, 14, 'seal', '界線'), decoration(8, 11, 'seal', '替代'), decoration(3, 11, 'inlay'), decoration(12, 15, 'petals')],
      clues: [[3, 13], [11, 13], [8, 6]], side: [5, 16],
      bonus: { puzzle: [12, 16], egg: [2, 7], errand: [10, 5], order: [6, 8] }
    },
    {
      id: 'u09',
      theme: theme('rules-fork', '規範岔路廊', '在最低要求與可靠回應之間思考', '#91a39c', '#d5d6c1', '#8f9eae', '#5d8075', '#d6e4e2', 'quiet'),
      summary: '南方岔路分向西側法規廊與東側服務廊，再於北方匯合。',
      walls: [[1, 3, 3, 1], [11, 3, 2, 2], [2, 10, 1, 2, 'trees'], [12, 8, 2, 2, 'crates']],
      paths: [route('law-branch', [[8, 17], [8, 12], [4, 12], [4, 6], [8, 6], [8, 3]], 2, 'slate'),
        route('service-branch', [[8, 12], [11, 12], [11, 7], [8, 7]], 2, 'slate'),
        route('law-reading', [[4, 7], [3, 7]], 1.5, 'slate'),
        route('open-question', [[11, 7], [14, 7], [14, 6]], 1.4, 'slate'),
        route('feedback-spur', [[8, 15], [7, 15]], 1.4, 'slate')],
      zones: [zone(3, 6, 3, 5, 'reading', '法規閱讀廊'), zone(10, 10, 4, 3, 'reading', '服務守則廊'), zone(6, 13, 4, 3, 'feedback', '回饋岔口')],
      decor: [decoration(8, 12, 'arrow', '思考'), decoration(4, 5, 'seal', '法'), decoration(10, 13, 'seal', '責'), decoration(14, 5, 'inlay')],
      clues: [[3, 7], [11, 11], [7, 15]], side: [14, 6],
      bonus: { puzzle: [5, 16], egg: [2, 14], errand: [12, 6], order: [6, 9] }
    },
    {
      id: 'u10',
      theme: theme('legal-reading-room', '法制資料三閱區', '依日期、效力與來源逐列核對', '#818e9e', '#c4c9ce', '#d4b886', '#587577', '#cad7e7', 'cool'),
      summary: '三條橫向閱覽廊分列教材、現行法與改革報告，中軸連接查證入口。',
      walls: [[1, 2, 3, 2], [11, 3, 1, 3], [13, 3, 1, 3], [1, 9, 1, 3], [12, 8, 2, 1, 'crates']],
      paths: [route('catalogue-spine', [[8, 17], [8, 3]], 1.5, 'tile'),
        route('historical-row', [[3, 5], [10, 5]], 1.7, 'tile'),
        route('current-row', [[4, 10], [13, 10]], 1.7, 'tile'),
        route('report-row', [[3, 15], [13, 15]], 1.7, 'tile'),
        route('title-check', [[13, 15], [13, 16]], 1.5, 'tile')],
      zones: [zone(3, 4, 7, 3, 'reading', '教材年代閱覽區'), zone(4, 9, 8, 3, 'reading', '現行法閱覽區'), zone(3, 14, 9, 3, 'reading', '改革報告閱覽區')],
      decor: [decoration(6, 5, 'seal', '年代'), decoration(10, 10, 'seal', '效力'), decoration(6, 15, 'seal', '進度'), decoration(10, 17, 'inlay')],
      clues: [[4, 5], [12, 10], [4, 15]], side: [13, 16],
      bonus: { puzzle: [6, 12], egg: [14, 6], errand: [2, 17], order: [10, 7] }
    },
    {
      id: 'u11',
      theme: theme('debate-amphitheatre', '辯論半環庭', '沿環形座席聽見不同理由', '#a89583', '#d9bc9a', '#a97784', '#7b8062', '#ead4d2', 'sunset'),
      summary: '三層半環地坪圍繞中央辯論臺，西南保留沒有座位者的入口。',
      walls: [[1, 2, 3, 1], [12, 4, 2, 2], [1, 9, 1, 1, 'trees'], [12, 8, 1, 1, 'crates']],
      paths: [route('outer-semicircle', [[3, 7], [3, 15], [13, 15], [13, 7]], 1.8, 'terracotta'),
        route('inner-semicircle', [[5, 8], [5, 13], [11, 13], [11, 8]], 1.6, 'terracotta'),
        route('debate-axis', [[8, 17], [8, 3]], 1.8, 'terracotta'),
        route('north-stage', [[3, 7], [8, 7], [13, 7]], 1.5, 'terracotta'),
        route('overlooked-entry', [[3, 15], [2, 15], [2, 17]]), route('east-voice', [[11, 12], [12, 12], [13, 12]])],
      zones: [zone(6, 8, 4, 4, 'stage', '理由辯論臺'), zone(2, 12, 3, 3, 'audience', '西側觀眾席'), zone(11, 12, 3, 3, 'audience', '東側觀眾席')],
      decor: [decoration(7, 9, 'seal', '理'), decoration(9, 10, 'seal', '由'), decoration(4, 16, 'inlay'), decoration(12, 16, 'inlay')],
      clues: [[3, 12], [12, 12], [8, 6]], side: [2, 17],
      bonus: { puzzle: [9, 14], egg: [14, 10], errand: [4, 6], order: [6, 17] }
    },
    {
      id: 'u12',
      theme: theme('rescue-switchback', '救援折返演訓區', '每次情報更新，都能回到保護問題', '#718f88', '#b8c4ae', '#e8b96a', '#416f62', '#b7d0d1', 'mist'),
      summary: '救援路線由南側折返中央，再向東北情報點延伸，邊線以可走的地面標記提示。',
      walls: [[2, 3, 2, 1], [11, 3, 3, 2], [1, 9, 2, 2, 'trees'], [12, 9, 1, 1, 'crates']],
      paths: [route('rescue-switchback', [[8, 17], [13, 17], [13, 15], [4, 15], [4, 12], [10, 12], [10, 6], [8, 6], [8, 3]], 2, 'gravel'),
        route('intelligence-lookout', [[10, 6], [11, 6]], 1.5, 'gravel'),
        route('marker-access', [[4, 15], [2, 15], [2, 16]], 1.5, 'gravel'),
        route('shelter-access', [[4, 12], [4, 8], [7, 8]], 1.2, 'gravel')],
      zones: [zone(10, 14, 4, 3, 'rescue', '保護範圍查核'), zone(3, 11, 4, 3, 'rescue', '交戰層次查核'), zone(8, 5, 4, 3, 'briefing', '新情報觀測'), zone(4, 7, 4, 3, 'shelter', '演訓保護區')],
      decor: [decoration(5, 15, 'stripe'), decoration(9, 12, 'stripe'), decoration(10, 7, 'stripe'), decoration(6, 8, 'seal', '保護')],
      clues: [[13, 15], [4, 12], [11, 6]], side: [2, 16],
      bonus: { puzzle: [6, 8], egg: [14, 6], errand: [11, 18], order: [8, 10] }
    },
    {
      id: 'u13',
      theme: theme('service-nine-court', '綜合服務九宮場', '把九步驟串成可回頭修訂的行動', '#779f90', '#d7d4b4', '#d6b66b', '#457768', '#dce4cc', 'clear'),
      summary: '九個小廣場組成三乘三格局，橫縱步道讓問題、諮詢與修訂反覆相接。',
      walls: [[1, 2, 1, 1], [13, 3, 1, 2], [1, 11, 1, 1, 'trees']],
      paths: [route('central-spine', [[8, 17], [8, 3]], 1.5, 'paving'),
        route('west-spine', [[4, 7], [4, 15]], 1.5, 'paving'), route('east-spine', [[12, 7], [12, 15]], 1.5, 'paving'),
        route('first-row', [[4, 7], [12, 7]], 1.5, 'paving'), route('second-row', [[4, 11], [12, 11]], 1.5, 'paving'),
        route('third-row', [[4, 15], [12, 15]], 1.5, 'paving')],
      zones: [zone(3, 6, 3, 3, 'step', '問題'), zone(7, 6, 3, 3, 'step', '責任'), zone(11, 6, 3, 3, 'step', '價值'),
        zone(3, 10, 3, 3, 'step', '方案'), zone(7, 10, 3, 3, 'step', '評估'), zone(11, 10, 3, 3, 'step', '諮詢'),
        zone(3, 14, 3, 3, 'step', '選擇'), zone(7, 14, 3, 3, 'step', '執行'), zone(11, 14, 3, 3, 'step', '回饋')],
      decor: [decoration(5, 8, 'step', '1'), decoration(9, 8, 'step', '2'), decoration(13, 8, 'step', '3'),
        decoration(5, 12, 'step', '4'), decoration(9, 12, 'step', '5'), decoration(13, 12, 'step', '6'),
        decoration(5, 16, 'step', '7'), decoration(9, 16, 'step', '8'), decoration(13, 16, 'step', '9')],
      clues: [[4, 15], [12, 11], [4, 7]], side: [12, 15],
      bonus: { puzzle: [8, 11], egg: [14, 17], errand: [12, 7], order: [4, 11] }
    }
  ];
  const layouts = new Map(definitions.map(d => [d.id, {
    map: {
      width: 16, height: 20, spawn: { x: 8, y: 17 }, gate: { x: 8, y: 3 },
      layoutId: d.id + '-' + d.theme.id, layoutVersion: 1,
      theme: d.theme, summary: d.summary,
      walls: d.walls.map(wall), paths: d.paths, zones: d.zones, decor: d.decor,
      bonusSpots: Object.fromEntries(Object.entries(d.bonus).map(([key, p]) => [key, point(p)]))
    },
    cluePositions: d.clues.map(point), sidePosition: point(d.side)
  }]));
  function get(id) {
    if (!layouts.has(id)) throw new Error('找不到章節地圖：' + String(id));
    return clone(layouts.get(id));
  }
  function apply(chapter) {
    if (!chapter || typeof chapter !== 'object' || !Array.isArray(chapter.clues) || chapter.clues.length !== 3 || !chapter.sideQuest) {
      throw new Error('章節地圖需要三份線索與支線資料。');
    }
    const layout = get(chapter.id);
    // Deliberately do not mutate RPGData or add anything to an engine/store state.
    return Object.assign({}, clone(chapter), {
      map: layout.map,
      clues: chapter.clues.map((clue, index) => Object.assign({}, clue, layout.cluePositions[index])),
      sideQuest: Object.assign({}, chapter.sideQuest, layout.sidePosition)
    });
  }
  return { version: 1, ids: definitions.map(d => d.id), get, apply };
});
