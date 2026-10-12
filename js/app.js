let curProblem = null, diffFilter = 'all', submissions = [], activeTab = 'tc';

function showPage(name){
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  document.querySelectorAll('.nav-links a').forEach((a) => a.classList.remove('active'));
  const pg = document.getElementById('page-' + name);
  if (pg) pg.classList.add('active');
  const nav = document.getElementById('nav-' + name);
  if (nav) nav.classList.add('active');
  if (name === 'problems') renderProblems();
  if (name === 'leaderboard') renderLB();
  if (name === 'profile') renderHeatmap();
  if (name === 'compiler') initCompiler();
  if (name === 'terminal') initTerminal();
}

function animCount(id, target) {
  let n = 0;
  const step = Math.ceil(target / 60);
  const el = document.getElementById(id);
  const t = setInterval(() => {
    n = Math.min(n + step, target);
    el.textContent = n.toLocaleString();
    if (n >= target) clearInterval(t);
  }, 18);
}

animCount('c-problems', 100);
animCount('c-users', 24600);
animCount('c-submissions', 380000);

function renderProblems(search = '') {
  const q = search.toLowerCase();
  const list = PROBLEMS.filter((p) => {
    const dm = diffFilter === 'all' || p.diff === diffFilter;
    const sm = !q || p.title.toLowerCase().includes(q) || p.tags.some((t) => t.toLowerCase().includes(q));
    return dm && sm;
  });
  document.getElementById('prob-count').textContent = `(${list.length})`;
  document.getElementById('problems-tbody').innerHTML = list.map((p) => `
    <tr onclick="openProblem(${p.id})">
      <td style="color:var(--muted);font-family:var(--font-code);font-size:.8rem">${p.id}</td>
      <td><span style="color:var(--green);margin-right:4px">${p.solved ? '✓' : ''}</span><strong>${p.title}</strong></td>
      <td><span class="diff-badge diff-${p.diff.toLowerCase()}">${p.diff}</span></td>
      <td>${p.tags.slice(0, 3).map((t) => `<span class="tag-chip">${t}</span>`).join('')}</td>
      <td style="color:var(--muted);font-family:var(--font-code);font-size:.8rem">${p.acc}%</td>
      <td style="color:var(--muted)">›</td>
    </tr>`).join('');
}

function setDiff(d, btn) {
  diffFilter = d;
  document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  renderProblems(document.getElementById('problem-search').value);
}

function filterProblems(v) { renderProblems(v); }

function openProblem(id) {
  curProblem = PROBLEMS.find((p) => p.id === id);
  if (!curProblem) return;
  document.getElementById('problem-panel-content').innerHTML = `
    <div class="problem-meta">
      <span class="diff-badge diff-${curProblem.diff.toLowerCase()}">${curProblem.diff}</span>
      ${curProblem.tags.map((t) => `<span class="tag-chip">${t}</span>`).join('')}
    </div>
    <div class="problem-title">#${curProblem.id}. ${curProblem.title}</div>
    <div class="problem-desc">${curProblem.desc}</div>
    ${curProblem.ex.map((e, i) => `
      <div><div class="sec-label">Example ${i + 1}</div>
      <div class="example-block">
        <strong>Input:</strong> ${e.i}<br>
        <strong>Output:</strong> ${e.o}
        ${e.e ? `<br><span style="color:var(--muted)">Explanation: ${e.e}</span>` : ''}
      </div></div>`).join('')}
    <div><div class="sec-label">Constraints</div>
    <ul class="cons-list">${curProblem.cons.map((c) => `<li>${c}</li>`).join('')}</ul></div>`;
  const lang = document.getElementById('lang-select').value;
  document.getElementById('code-editor').value = curProblem.starterCode[lang];
  updateLineNums();
  switchTab('tc', null);
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  document.getElementById('page-solve').classList.add('active');
  document.querySelectorAll('.nav-links a').forEach((a) => a.classList.remove('active'));
}

function changeLang(l) {
  if (curProblem) {
    document.getElementById('code-editor').value = curProblem.starterCode[l];
    updateLineNums();
  }
}

function resetCode() {
  if (!curProblem) return;
  const l = document.getElementById('lang-select').value;
  document.getElementById('code-editor').value = curProblem.starterCode[l];
  updateLineNums();
  showToast('Code reset', '');
}

function updateLineNums() {
  const code = document.getElementById('code-editor').value;
  const lines = code.split('\n').length;
  document.getElementById('line-numbers').innerHTML = Array.from({ length: lines }, (_, i) => `<div class="line-num">${i + 1}</div>`).join('');
  const ed = document.getElementById('code-editor');
  document.getElementById('line-numbers').scrollTop = ed.scrollTop;
}

function handleTab(e) {
  if (e.key === 'Tab') {
    e.preventDefault();
    const el = e.target;
    const s = el.selectionStart;
    el.value = el.value.substring(0, s) + '    ' + el.value.substring(el.selectionEnd);
    el.selectionStart = el.selectionEnd = s + 4;
    updateLineNums();
  }
}

function switchTab(tab, btnEl) {
  activeTab = tab;
  document.querySelectorAll('.output-tab').forEach((t) => t.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  else {
    const tabs = ['tc', 'res', 'sub'];
    document.querySelectorAll('.output-tab').forEach((t, i) => {
      if (tabs[i] === tab) t.classList.add('active');
    });
  }
  const el = document.getElementById('output-content');
  if (tab === 'tc' && curProblem) {
    el.innerHTML = curProblem.tc.slice(0, 2).map((t, i) => `<div class="test-case"><div class="test-io"><div class="test-io-label">Input ${i + 1}</div>${t.i}</div><div class="test-io"><div class="test-io-label">Expected</div>${t.o}</div></div>`).join('');
  } else if (tab === 'sub') {
    el.innerHTML = submissions.length ? submissions.map((s) => `<div class="result-row"><span class="${s.ac ? 'result-pass' : 'result-fail'}">${s.ac ? '✓ Accepted' : '✗ Wrong Answer'}</span><span style="color:var(--muted);font-family:var(--font-code);font-size:.72rem">${s.time}ms · ${s.mem}MB</span><span style="color:var(--muted);font-size:.72rem">${s.lang} · ${s.date}</span></div>`).join('') : '<span style="color:var(--muted)">No submissions yet.</span>';
  } else if (tab === 'res') {
    el.innerHTML = '<span style="color:var(--muted)">Run your code to see results.</span>';
  }
}

function runCode() {
  if (!curProblem) return;
  const btn = document.querySelector('.btn-run');
  btn.innerHTML = '<span class="spinner"></span> Running';
  btn.disabled = true;
  loadBar(.6);
  setTimeout(() => {
    btn.innerHTML = '▶ Run';
    btn.disabled = false;
    loadBar(1);
    const results = curProblem.tc.map((t, i) => ({ t, pass: Math.random() > .3, i }));
    switchTab('res', null);
    document.getElementById('output-content').innerHTML = results.map((r) => `<div class="result-row"><span class="${r.pass ? 'result-pass' : 'result-fail'}">${r.pass ? '✓ Passed' : '✗ Failed'}</span><span style="color:var(--muted);font-size:.78rem">Case ${r.i + 1}: ${r.t.i}</span><span style="color:var(--muted);font-family:var(--font-code);font-size:.72rem">Expected: ${r.t.o}</span></div>`).join('');
    showToast('Ran against test cases', '');
    setTimeout(() => loadBar(0), 500);
  }, 1400);
}

function submitCode() {
  if (!curProblem) return;
  const btn = document.querySelector('.btn-submit');
  btn.innerHTML = '<span class="spinner spinner-w"></span> Judging';
  btn.disabled = true;
  loadBar(.8);
  setTimeout(() => {
    btn.innerHTML = '↑ Submit';
    btn.disabled = false;
    loadBar(1);
    const ac = Math.random() > .4, lang = document.getElementById('lang-select').value;
    const t = Math.floor(Math.random() * 80) + 20, mem = (Math.random() * 5 + 13).toFixed(1);
    submissions.unshift({ ac, time: t, mem, lang, date: new Date().toLocaleTimeString() });
    switchTab('res', null);
    document.getElementById('output-content').innerHTML = `<div class="verdict-box ${ac ? 'verdict-ac' : 'verdict-wa'}">${ac ? '✓ Accepted' : '✗ Wrong Answer'}${ac ? `<span style="font-size:.78rem;margin-left:auto">${t}ms · ${mem}MB</span>` : ''}</div><div style="color:var(--muted);font-size:.82rem">${ac ? 'All test cases passed!' : 'Check your logic and try again.'}</div>`;
    showToast(ac ? '🎉 Accepted!' : 'Wrong Answer – keep trying!', ac ? 'success' : 'error');
    setTimeout(() => loadBar(0), 500);
  }, 2200);
}

function renderLB() {
  const max = LB[0].s;
  document.getElementById('lb-tbody').innerHTML = LB.map((u, i) => {
    const rc = i === 0 ? 'rank-gold' : i === 1 ? 'rank-silver' : i === 2 ? 'rank-bronze' : '';
    return `<tr><td><span class="rank-num ${rc}">${i + 1}</span></td><td><span class="avatar" style="background:${u.col}22;color:${u.col}">${u.n[0]}</span><strong>${u.n}</strong></td><td style="font-family:var(--font-code);font-weight:700">${u.s.toLocaleString()}</td><td style="font-family:var(--font-code)">${u.solved}</td><td>🔥 ${u.streak}</td><td><span class="score-bg"><span class="score-fill" style="width:${Math.round(u.s / max * 100)}%;background:${u.col}"></span></span></td></tr>`;
  }).join('');
}

function renderHeatmap() {
  document.getElementById('heatmap').innerHTML = Array.from({ length: 52 * 7 }, () => {
    const r = Math.random();
    const c = r > .85 ? 'h4' : r > .7 ? 'h3' : r > .55 ? 'h2' : r > .4 ? 'h1' : '';
    return `<div class="hc ${c}"></div>`;
  }).join('');
}

const CLANG_CFG = {
  python: {
    file: 'main.py', dot: '#3b82f6',
    code: `# Python 3\ndef solve():\n    n = int(input())\n    nums = list(map(int, input().split()))\n    print(sum(nums))\n\nsolve()\n`,
    snips: [{ l: 'Read Int', c: 'n = int(input())\n' }, { l: 'Read List', c: 'nums = list(map(int, input().split()))\n' }, { l: 'For Loop', c: 'for i in range(n):\n    pass\n' }, { l: 'Dict', c: 'd = {}\nd[key] = d.get(key,0)+1\n' }, { l: 'Sort', c: 'nums.sort()\n' }, { l: 'BFS', c: 'from collections import deque\nq = deque([start])\n' }, { l: 'Binary Search', c: 'import bisect\ni = bisect.bisect_left(arr, x)\n' }]
  },
  javascript: {
    file: 'main.js', dot: '#f59e0b',
    code: `// JavaScript (Node.js)\nconst lines = require('fs').readFileSync('/dev/stdin','utf8').trim().split('\\n');\nlet idx = 0;\nconst n = parseInt(lines[idx++]);\nconst nums = lines[idx++].split(' ').map(Number);\nconsole.log(nums.reduce((a,b)=>a+b,0));\n`,
    snips: [{ l: 'Read Lines', c: "const lines=require('fs').readFileSync('/dev/stdin','utf8').trim().split('\\n');\nlet idx=0;\n" }, { l: 'Parse Int', c: 'const n=parseInt(lines[idx++]);\n' }, { l: 'Parse Array', c: "const nums=lines[idx++].split(' ').map(Number);\n" }, { l: 'For Of', c: 'for(const x of nums){\n    \n}\n' }, { l: 'Map/Filter', c: 'const r=nums.filter(x=>x>0).map(x=>x*2);\n' }, { l: 'Sort', c: 'nums.sort((a,b)=>a-b);\n' }, { l: 'Set/Map', c: 'const set=new Set();\nconst map=new Map();\n' }]
  },
  java: {
    file: 'Main.java', dot: '#f97316',
    code: `// Java\nimport java.util.*;\nimport java.io.*;\npublic class Main {\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        int n = Integer.parseInt(br.readLine().trim());\n        StringTokenizer st = new StringTokenizer(br.readLine());\n        int[] nums = new int[n];\n        for(int i=0;i<n;i++) nums[i]=Integer.parseInt(st.nextToken());\n        long sum=0; for(int x:nums) sum+=x;\n        System.out.println(sum);\n    }\n}\n`,
    snips: [{ l: 'Scanner', c: 'Scanner sc=new Scanner(System.in);\nint n=sc.nextInt();\n' }, { l: 'ArrayList', c: 'List<Integer> list=new ArrayList<>();\n' }, { l: 'HashMap', c: 'Map<Integer,Integer> map=new HashMap<>();\nmap.put(k,map.getOrDefault(k,0)+1);\n' }, { l: 'Arrays.sort', c: 'Arrays.sort(nums);\n' }, { l: 'For Loop', c: 'for(int i=0;i<n;i++){\n    \n}\n' }, { l: 'Stack', c: 'Deque<Integer> stack=new ArrayDeque<>();\n' }, { l: 'PQ', c: 'PriorityQueue<Integer> pq=new PriorityQueue<>();\n' }]
  },
  cpp: {
    file: 'main.cpp', dot: '#a78bfa',
    code: `// C++ (GCC 17)\n#include <bits/stdc++.h>\nusing namespace std;\nint main(){\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n    int n; cin>>n;\n    vector<int> v(n);\n    for(int i=0;i<n;i++) cin>>v[i];\n    long long s=0;\n    for(int x:v) s+=x;\n    cout<<s<<"\\n";\n    return 0;\n}\n`,
    snips: [{ l: 'Fast IO', c: 'ios_base::sync_with_stdio(false);\ncin.tie(NULL);\n' }, { l: 'Vector', c: 'vector<int> v(n);\nfor(int i=0;i<n;i++) cin>>v[i];\n' }, { l: 'Sort', c: 'sort(v.begin(),v.end());\n' }, { l: 'Map/Set', c: 'map<int,int> mp;\nset<int> st;\n' }, { l: 'For Range', c: 'for(auto& x:v){\n    \n}\n' }, { l: 'PQ', c: 'priority_queue<int> maxpq;\npriority_queue<int,vector<int>,greater<int>> minpq;\n' }, { l: 'BFS', c: 'queue<int> q;\nq.push(s);\nvector<bool> vis(n,false);\n' }]
  },
  c: {
    file: 'main.c', dot: '#34d399',
    code: `// C (GCC)\n#include <stdio.h>\n#include <stdlib.h>\nint main(){\n    int n;\n    scanf("%d",&n);\n    int nums[n];\n    for(int i=0;i<n;i++) scanf("%d",&nums[i]);\n    long long s=0;\n    for(int i=0;i<n;i++) s+=nums[i];\n    printf("%lld\\n",s);\n    return 0;\n}\n`,
    snips: [{ l: 'Read Int', c: 'int n;\nscanf("%d",&n);\n' }, { l: 'Read Array', c: 'int arr[n];\nfor(int i=0;i<n;i++) scanf("%d",&arr[i]);\n' }, { l: 'Printf', c: 'printf("%d\\n",result);\n' }, { l: 'For Loop', c: 'for(int i=0;i<n;i++){\n    \n}\n' }, { l: 'Malloc', c: 'int* arr=(int*)malloc(n*sizeof(int));\nfree(arr);\n' }, { l: 'Strcmp', c: 'if(strcmp(a,b)==0){/* equal */}\n' }, { l: 'qsort', c: 'int cmp(const void*a,const void*b){return(*(int*)a-*(int*)b);} \nqsort(arr,n,sizeof(int),cmp);\n' }]
  }
};
const COUT_SAMPLES = {
  python: [{ o: '15\n', t: '42ms', m: '8.2MB' }, { o: 'Hello, World!\n', t: '38ms', m: '7.9MB' }],
  javascript: [{ o: '15\n', t: '68ms', m: '18.4MB' }, { o: 'Hello, World!\n', t: '72ms', m: '17.8MB' }],
  java: [{ o: '15\n', t: '185ms', m: '42.1MB' }, { o: 'Hello, World!\n', t: '192ms', m: '41.8MB' }],
  cpp: [{ o: '15\n', t: '12ms', m: '3.8MB' }, { o: 'Hello, World!\n', t: '10ms', m: '3.5MB' }],
  c: [{ o: '15\n', t: '8ms', m: '1.2MB' }, { o: 'Hello, World!\n', t: '7ms', m: '1.1MB' }]
};
let cLang = 'python', cCode = {};

function initCompiler() {
  const cfg = CLANG_CFG[cLang];
  if (!cCode[cLang]) cCode[cLang] = cfg.code;
  document.getElementById('comp-textarea').value = cCode[cLang];
  document.getElementById('comp-file').textContent = cfg.file;
  renderCLinNums();
  renderSnips();
  updCursor();
}

function switchCLang(l, btn) {
  cCode[cLang] = document.getElementById('comp-textarea').value;
  cLang = l;
  document.querySelectorAll('.clang-tab').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  const cfg = CLANG_CFG[l];
  if (!cCode[l]) cCode[l] = cfg.code;
  document.getElementById('comp-textarea').value = cCode[l];
  document.getElementById('comp-file').textContent = cfg.file;
  renderCLinNums();
  renderSnips();
  resetCompOut();
  showToast(`Switched to ${cfg.file}`, '');
}

function renderCLinNums() {
  const ta = document.getElementById('comp-textarea');
  const lines = ta.value.split('\n').length;
  document.getElementById('comp-lnums').innerHTML = Array.from({ length: lines }, (_, i) => `<div class="line-num">${i + 1}</div>`).join('');
  document.getElementById('comp-lnums').scrollTop = ta.scrollTop;
}

function onCompInput() {
  cCode[cLang] = document.getElementById('comp-textarea').value;
  renderCLinNums();
  updCursor();
}

function compTab(e) {
  if (e.key === 'Tab') {
    e.preventDefault();
    const el = e.target, s = el.selectionStart;
    el.value = el.value.substring(0, s) + '    ' + el.value.substring(el.selectionEnd);
    el.selectionStart = el.selectionEnd = s + 4;
    onCompInput();
  }
}

function updCursor() {
  const ta = document.getElementById('comp-textarea');
  const t = ta.value.substring(0, ta.selectionStart);
  const ls = t.split('\n');
  document.getElementById('comp-cursor').textContent = `Ln ${ls.length}, Col ${ls[ls.length - 1].length + 1}`;
}

function renderSnips() {
  const snips = CLANG_CFG[cLang].snips;
  document.getElementById('snip-bar').innerHTML = '<span style="font-size:.68rem;color:var(--muted);font-weight:700;white-space:nowrap;align-self:center">Snippets: </span>' + snips.map((s, i) => `<button class="snip-chip" onclick="insertSnip(${i})">${s.l}</button>`).join('');
}

function insertSnip(i) {
  const ta = document.getElementById('comp-textarea');
  const snip = CLANG_CFG[cLang].snips[i].c;
  const s = ta.selectionStart;
  ta.value = ta.value.substring(0, s) + snip + ta.value.substring(ta.selectionEnd);
  ta.selectionStart = ta.selectionEnd = s + snip.length;
  ta.focus();
  onCompInput();
  showToast('Snippet inserted', '');
}

function clearComp() {
  document.getElementById('comp-textarea').value = '';
  cCode[cLang] = '';
  renderCLinNums();
  resetCompOut();
}

function copyComp() {
  navigator.clipboard.writeText(document.getElementById('comp-textarea').value).then(() => showToast('Code copied!', 'success'));
}

function cFontSize(s) { document.getElementById('comp-textarea').style.fontSize = s + 'px'; }

function cTheme(t) {
  const themes = {
    dark: { bg: '#0a0c10', text: '#e2e8f0' },
    midnight: { bg: '#0d1117', text: '#c9d1d9' },
    forest: { bg: '#0f1a0f', text: '#d4e8d4' },
    light: { bg: '#f8fafc', text: '#1e293b' }
  };
  const th = themes[t];
  if (th) {
    document.getElementById('comp-textarea').style.background = th.bg;
    document.getElementById('comp-textarea').style.color = th.text;
    document.getElementById('comp-output').style.background = th.bg;
  }
  showToast(`Theme: ${t}`, '');
}

function resetCompOut() {
  const o = document.getElementById('comp-output');
  o.textContent = '// Output will appear here after you run your code.';
  o.className = 'comp-output out-idle';
  document.getElementById('comp-meta').style.display = 'none';
  const b = document.getElementById('comp-status');
  b.textContent = 'Idle';
  b.style.background = 'rgba(100,116,139,.15)';
  b.style.color = 'var(--muted)';
}

function compRun() {
  const code = document.getElementById('comp-textarea').value.trim();
  if (!code) {
    showToast('Write some code first!', 'error');
    return;
  }
  const btn = document.querySelector('.compiler-page .btn-run');
  btn.innerHTML = '<span class="spinner"></span> Running…';
  btn.disabled = true;
  loadBar(.7);
  const o = document.getElementById('comp-output');
  o.textContent = '⟳  Compiling…';
  o.className = 'comp-output out-running';
  const b = document.getElementById('comp-status');
  b.textContent = 'Running';
  b.style.background = 'rgba(0,229,255,.12)';
  b.style.color = 'var(--accent)';
  const delay = { python: 900, javascript: 700, java: 1800, cpp: 1200, c: 1000 };
  setTimeout(() => {
    btn.innerHTML = '▶ Run Code';
    btn.disabled = false;
    loadBar(1);
    setTimeout(() => loadBar(0), 500);
    const err = Math.random() < .15;
    if (err) {
      const errs = {
        python: `Traceback (most recent call last):\n  File "main.py", line 2\n    n = int(input())\nEOFError: EOF when reading a line`,
        javascript: `RangeError: idx out of bounds\n    at Object.<anonymous> (main.js:3:15)`,
        java: `Main.java:5: error: illegal start of expression\n1 error`,
        cpp: `main.cpp:5:5: error: 'vcetor' was not declared in this scope`,
        c: `main.c:5:5: error: use of undeclared identifier 'pritnf'`
      };
      o.textContent = errs[cLang];
      o.className = 'comp-output out-error';
      b.textContent = 'Error';
      b.style.background = 'rgba(239,68,68,.15)';
      b.style.color = 'var(--red)';
      document.getElementById('comp-meta').style.display = 'none';
      showToast('Runtime error', 'error');
    } else {
      const stdin = document.getElementById('comp-stdin').value.trim();
      const outText = simOut(code, stdin, cLang);
      o.textContent = outText;
      o.className = 'comp-output out-success';
      b.textContent = 'Success';
      b.style.background = 'rgba(34,197,94,.15)';
      b.style.color = 'var(--green)';
      const s = COUT_SAMPLES[cLang][Math.floor(Math.random() * COUT_SAMPLES[cLang].length)];
      document.getElementById('comp-time').textContent = s.t;
      document.getElementById('comp-mem').textContent = s.m;
      document.getElementById('comp-lang-tag').textContent = CLANG_CFG[cLang].file;
      document.getElementById('comp-meta').style.display = 'flex';
      showToast(`Done in ${s.t} · ${s.m}`, 'success');
    }
  }, delay[cLang]);
}

function simOut(code, stdin, lang) {
  const ls = stdin ? stdin.split('\n') : [];
  if (/hello[,\s]*world/i.test(code)) return 'Hello, World!\n';
  const sm = code.match(/print\(["'](.+?)["']\)|console\.log\(["'](.+?)["']\)|cout\s*<<\s*["'](.+?)["']/);
  if (sm) return (sm[1] || sm[2] || sm[3]) + '\n';
  if (/fib/i.test(code)) {
    const n = parseInt(ls[0]) || 10;
    const f = [0, 1];
    for (let i = 2; i <= Math.min(n, 14); i++) f.push(f[i - 1] + f[i - 2]);
    return f.join(' ') + '\n';
  }
  if (/factorial/i.test(code)) {
    const n = parseInt(ls[0]) || 5;
    let r = 1;
    for (let i = 2; i <= n; i++) r *= i;
    return `${r}\n`;
  }
  if (/prime/i.test(code)) {
    const n = parseInt(ls[0]) || 10;
    const primes = [];
    for (let i = 2; primes.length < n; i++) {
      let ok = true;
      for (let j = 2; j * j <= i; j++) if (i % j === 0) { ok = false; break; }
      if (ok) primes.push(i);
    }
    return primes.join(' ') + '\n';
  }
  if (ls.length >= 2) {
    const nums = ls[1]?.split(/\s+/).map(Number).filter((x) => !isNaN(x));
    if (nums && nums.length > 0) return `${nums.reduce((a, b) => a + b, 0)}\n`;
  }
  if (ls.length === 1) {
    const n = parseInt(ls[0]);
    if (!isNaN(n)) return `${n}\n`;
  }
  return COUT_SAMPLES[lang][Math.floor(Math.random() * COUT_SAMPLES[lang].length)].o;
}

let VFS = {
  '/': {
    type: 'dir',
    children: {
      home: {
        type: 'dir',
        children: {
          user: {
            type: 'dir',
            children: {
              projects: {
                type: 'dir',
                children: {
                  'hello.py': { type: 'file', content: 'print("Hello, World!")\n' },
                  'fib.py': { type: 'file', content: 'def fib(n):\n    a,b=0,1\n    for _ in range(n): a,b=b,a+b\n    return a\nfor i in range(10): print(fib(i))\n' },
                  'sum.js': { type: 'file', content: 'const nums=[1,2,3,4,5];\nconsole.log(nums.reduce((a,b)=>a+b,0));\n' },
                  'main.cpp': { type: 'file', content: '#include<bits/stdc++.h>\nusing namespace std;\nint main(){\n    cout<<"C++ works!"<<endl;\n    return 0;\n}\n' },
                  'solution.c': { type: 'file', content: '#include<stdio.h>\nint main(){\n    printf("C works!\\n");\n    return 0;\n}\n' }
                }
              },
              notes: {
                type: 'dir',
                children: {
                  'README.md': { type: 'file', content: '# CodeArena Notes\n\nWelcome to your workspace!\n\n## Tips\n- Use `ls` to list files\n- Use `cat` to view files\n- Use `python3 file.py` to run Python\n' },
                  'algorithms.txt': { type: 'file', content: 'Common Algorithm Complexities:\n\nSorting:\n  Bubble Sort: O(n²)\n  Merge Sort:  O(n log n)\n  Quick Sort:  O(n log n) avg\n\nSearching:\n  Linear: O(n)\n  Binary: O(log n)\n\nData Structures:\n  Array access: O(1)\n  Linked list:  O(n)\n  Hash table:   O(1) avg\n  BST:          O(log n) avg\n' }
                }
              },
              downloads: { type: 'dir', children: {} },
              '.bashrc': { type: 'file', content: '# .bashrc\nexport PS1="\\u@codearena:\\w$ "\nexport PATH="/usr/local/bin:$PATH"\nalias ll="ls -la"\nalias py="python3"\n' },
              '.gitconfig': { type: 'file', content: '[user]\n    name = CodeArena User\n    email = user@codearena.dev\n[core]\n    editor = nano\n' }
            }
          }
        }
      },
      usr: {
        type: 'dir',
        children: {
          bin: { type: 'dir', children: {} },
          local: { type: 'dir', children: {} }
        }
      },
      tmp: { type: 'dir', children: {} },
      etc: {
        type: 'dir',
        children: {
          hosts: { type: 'file', content: '127.0.0.1 localhost\n127.0.1.1 codearena\n::1       localhost ip6-localhost\n' },
          'os-release': { type: 'file', content: 'NAME="CodeArena OS"\nVERSION="2.0"\nID=codearena\nPRETTY_NAME="CodeArena Linux 2.0"\n' }
        }
      }
    }
  }
};

let termCwd = '/home/user';
let termHistory = [];
let termHistIdx = -1;
let termTabs = [{ id: 0, name: 'bash', cwd: '/home/user', history: [] }];
let activeTTab = 0;
let termTabCount = 1;
let tInitialized = false;

function getNode(path) {
  if (path === '/') return VFS['/'];
  const parts = path.replace(/^\/+/, '').split('/').filter(Boolean);
  let node = VFS['/'];
  for (const p of parts) {
    if (!node.children || !node.children[p]) return null;
    node = node.children[p];
  }
  return node;
}

function resolvePath(input, cwd) {
  if (!input || input === '~') return '/home/user';
  if (input.startsWith('/')) return normPath(input);
  if (input === '.') return cwd;
  if (input === '..') return cwd === '/' ? '/' : cwd.split('/').slice(0, -1).join('/') || '/';
  let parts = cwd.split('/').filter(Boolean);
  for (const seg of input.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg && seg !== '.') parts.push(seg);
  }
  return '/' + parts.join('/');
}

function normPath(p) {
  const parts = p.split('/').filter(Boolean);
  const result = [];
  for (const s of parts) {
    if (s === '..') result.pop();
    else if (s !== '.') result.push(s);
  }
  return '/' + result.join('/');
}

function shortPath(p) { return p.startsWith('/home/user') ? p.replace('/home/user', '~') : p; }

function initTerminal() {
  if (tInitialized) return;
  tInitialized = true;
  renderTermFS();
  const out = document.getElementById('term-output');
  out.innerHTML = '';
  termPrint('<span class="t-out sys">  ____          _        _    \n / ___|___   __| | ___  / \\   _ __ ___ _ __   __ _ \n| |   / _ \\ / _\` |/ _ \\/ _ \\ | \'__ / _ \\ \'_ \\ / _\` |\n| |__| (_) | (_| |  __/ ___ \\| | |  __/ | | | (_| |\n \\____\\___/ \\__,_|\\___/_/   \\_\\_|  \\___|_| |_|\\__,_|\n</span>');
  termPrint('<span class="t-out info">CodeArena Terminal v2.0 — Linux-style shell simulator</span>');
  termPrint('<span class="t-out dim">Type <span style="color:var(--accent)">help</span> for available commands. Tab autocomplete supported.</span>');
  termPrint('<span class="t-out dim">Current directory: ' + shortPath(termCwd) + '</span>');
  termPrint('');
  document.getElementById('term-input').focus();
  document.getElementById('term-path-label').textContent = `:${shortPath(termCwd)}$`;
  document.getElementById('term-title').textContent = `user@codearena: ${shortPath(termCwd)}`;
}

function termPrint(html, cls = '') {
  const out = document.getElementById('term-output');
  const div = document.createElement('div');
  div.className = 't-line';
  div.innerHTML = cls ? `<span class="t-out ${cls}">${html}</span>` : html;
  out.appendChild(div);
  out.scrollTop = out.scrollHeight;
}

function termPrintCmd(cmd) {
  const out = document.getElementById('term-output');
  const div = document.createElement('div');
  div.className = 't-line';
  div.innerHTML = `<span class="t-ps1">user</span><span class="t-at">@</span><span class="t-host">codearena</span><span class="t-path">:${shortPath(termCwd)}</span><span class="t-dollar">$</span><span class="t-cmd-text"> ${escHTML(cmd)}</span>`;
  out.appendChild(div);
  out.scrollTop = out.scrollHeight;
}

function escHTML(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function handleTermKey(e) {
  const inp = document.getElementById('term-input');
  if (e.key === 'Enter') {
    const cmd = inp.value.trim();
    inp.value = '';
    if (cmd) {
      termHistory.unshift(cmd);
      termHistIdx = -1;
    }
    termPrintCmd(cmd || '');
    if (cmd) execTerm(cmd);
    else termPrint('');
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (termHistIdx < termHistory.length - 1) {
      termHistIdx++;
      inp.value = termHistory[termHistIdx];
    }
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (termHistIdx > 0) {
      termHistIdx--;
      inp.value = termHistory[termHistIdx];
    } else {
      termHistIdx = -1;
      inp.value = '';
    }
  } else if (e.key === 'Tab') {
    e.preventDefault();
    autoComplete(inp);
  } else if (e.key === 'c' && e.ctrlKey) {
    e.preventDefault();
    inp.value = '';
    termPrint('<span class="t-out dim">^C</span>');
  } else if (e.key === 'l' && e.ctrlKey) {
    e.preventDefault();
    clearTerm();
  }
}

function autoComplete(inp) {
  const val = inp.value;
  const parts = val.split(' ');
  if (parts.length === 1) {
    const cmds = ['ls', 'cd', 'pwd', 'cat', 'touch', 'mkdir', 'rm', 'rmdir', 'cp', 'mv', 'echo', 'clear', 'history', 'help', 'whoami', 'date', 'uname', 'ps', 'grep', 'wc', 'sort', 'head', 'tail', 'python3', 'node', 'gcc', 'g++', 'javac', 'java', 'nano', 'vim', 'which', 'env', 'export', 'alias', 'unalias', 'man', 'chmod', 'find', 'diff', 'du', 'df'];
    const matches = cmds.filter((c) => c.startsWith(val));
    if (matches.length === 1) inp.value = matches[0] + ' ';
    else if (matches.length > 1) termPrint(`<span class="t-out dim">${matches.join('  ')}</span>`);
  } else {
    const prefix = parts[parts.length - 1];
    const node = getNode(termCwd);
    if (node && node.children) {
      const matches = Object.keys(node.children).filter((k) => k.startsWith(prefix));
      if (matches.length === 1) {
        parts[parts.length - 1] = matches[0];
        inp.value = parts.join(' ');
      } else if (matches.length > 1) termPrint(`<span class="t-out dim">${matches.join('  ')}</span>`);
    }
  }
}

function execTerm(input) {
  if (input.includes('|')) {
    const [left, right] = input.split('|').map((s) => s.trim());
    const leftOut = captureTerm(left);
    if (right.startsWith('grep')) {
      const pat = right.split(' ')[1] || '';
      const lines = leftOut.split('\n').filter((l) => l.includes(pat));
      if (lines.length) lines.forEach((l) => termPrint(`<span class="t-out">${escHTML(l)}</span>`));
      else termPrint('<span class="t-out dim">(no matches)</span>');
    } else if (right === 'wc -l' || right === 'wc') {
      termPrint(`<span class="t-out">${leftOut.split('\n').filter(Boolean).length}</span>`);
    } else if (right === 'sort') {
      leftOut.split('\n').filter(Boolean).sort().forEach((l) => termPrint(`<span class="t-out">${escHTML(l)}</span>`));
    } else {
      termPrint(`<span class="t-out err">pipe: unsupported right command: ${escHTML(right)}</span>`);
    }
    return;
  }

  let cmd = input, outFile = null, appendFile = null;
  if (input.includes('>>')) [cmd, appendFile] = input.split('>>').map((s) => s.trim());
  else if (input.includes('>')) [cmd, outFile] = input.split('>').map((s) => s.trim());

  const parts = cmd.trim().split(/\s+/);
  const command = parts[0];
  const args = parts.slice(1);

  let output = '';

  switch (command) {
    case '': break;
    case 'clear': clearTerm(); return;
    case 'help': termHelp(); return;
    case 'pwd': output = termCwd; break;
    case 'whoami': output = 'user'; break;
    case 'hostname': output = 'codearena'; break;
    case 'date': output = new Date().toString(); break;
    case 'uname':
      if (args.includes('-a') || args.includes('-all')) output = 'Linux codearena 5.15.0-codearena #1 SMP x86_64 GNU/Linux';
      else output = 'Linux';
      break;
    case 'uptime': output = 'up 4 days, 2:17, 1 user, load average: 0.12, 0.08, 0.05'; break;
    case 'ps':
      output = '  PID TTY          TIME CMD\n  1   pts/0    00:00:00 bash\n  42  pts/0    00:00:00 ps';
      break;
    case 'env':
      output = 'HOME=/home/user\nUSER=user\nSHELL=/bin/bash\nPATH=/usr/local/bin:/usr/bin:/bin\nTERM=xterm-256color\nLANG=en_US.UTF-8';
      break;
    case 'echo': {
      const txt = args.join(' ').replace(/^['"]|['"]$/g, '');
      if (outFile) {
        setFileContent(outFile, txt + '\n');
        renderTermFS();
        output = '';
      } else if (appendFile) {
        const existing = getFileContent(appendFile) || '';
        setFileContent(appendFile, existing + txt + '\n');
        renderTermFS();
        output = '';
      } else {
        output = txt;
      }
      break;
    }
    case 'ls': {
      const showHidden = args.includes('-la') || args.includes('-a') || args.includes('-al');
      const longFmt = args.includes('-l') || args.includes('-la') || args.includes('-al');
      const targetArg = args.filter((a) => !a.startsWith('-'))[0];
      const targetPath = targetArg ? resolvePath(targetArg, termCwd) : termCwd;
      const node = getNode(targetPath);
      if (!node) {
        termPrint(`<span class="t-out err">ls: cannot access '${escHTML(targetPath)}': No such file or directory</span>`);
        return;
      }
      if (node.type === 'file') {
        termPrint(`<span class="t-out">${escHTML(targetPath.split('/').pop())}</span>`);
        return;
      }
      const entries = Object.entries(node.children || {});
      const visible = showHidden ? entries : entries.filter(([k]) => !k.startsWith('.'));
      if (!visible.length) {
        termPrint('<span class="t-out dim">(empty)</span>');
        return;
      }
      if (longFmt) {
        if (showHidden && node.children) {
          termPrint('<span class="t-out dim">total ' + (visible.length + 2) + '</span>');
          termPrint('<span class="t-out info">drwxr-xr-x  2 user user 4096 ' + new Date().toDateString() + ' .</span>');
          termPrint('<span class="t-out info">drwxr-xr-x  5 user user 4096 ' + new Date().toDateString() + ' ..</span>');
        }
        visible.forEach(([k, v]) => {
          const isDir = v.type === 'dir';
          const perm = isDir ? 'drwxr-xr-x' : '-rw-r--r--';
          const size = isDir ? 4096 : (v.content || '').length;
          const col = isDir ? 'info' : '';
          termPrint(`<span class="t-out ${col}">${perm}  1 user user ${String(size).padStart(6)} ${new Date().toDateString()} ${escHTML(k)}${isDir ? '/' : ''}</span>`);
        });
      } else {
        const row = visible.map(([k, v]) => {
          const isDir = v.type === 'dir';
          const col = isDir ? 'color:var(--accent)' : 'color:#c9d1d9';
          return `<span style="${col}">${escHTML(k)}${isDir ? '/' : ''}</span>`;
        }).join('  ');
        termPrint(`<span class="t-out">${row}</span>`);
      }
      break;
    }
    case 'cd': {
      const target = args[0] || '~';
      const newPath = resolvePath(target, termCwd);
      const node = getNode(newPath);
      if (!node) {
        termPrint(`<span class="t-out err">cd: ${escHTML(newPath)}: No such file or directory</span>`);
        return;
      }
      if (node.type !== 'dir') {
        termPrint(`<span class="t-out err">cd: ${escHTML(newPath)}: Not a directory</span>`);
        return;
      }
      termCwd = newPath;
      document.getElementById('term-path-label').textContent = `:${shortPath(termCwd)}$`;
      document.getElementById('term-title').textContent = `user@codearena: ${shortPath(termCwd)}`;
      renderTermFS();
      break;
    }
    case 'cat': {
      if (!args[0]) {
        termPrint('<span class="t-out err">cat: missing operand</span>');
        return;
      }
      const fp = resolvePath(args[0], termCwd);
      const node = getNode(fp);
      if (!node) {
        termPrint(`<span class="t-out err">cat: ${escHTML(args[0])}: No such file or directory</span>`);
        return;
      }
      if (node.type === 'dir') {
        termPrint(`<span class="t-out err">cat: ${escHTML(args[0])}: Is a directory</span>`);
        return;
      }
      const lines = (node.content || '').split('\n');
      lines.forEach((l) => termPrint(`<span class="t-out">${escHTML(l)}</span>`));
      break;
    }
    case 'touch': {
      if (!args[0]) {
        termPrint('<span class="t-out err">touch: missing file operand</span>');
        return;
      }
      const fn = args[0];
      const node = getNode(termCwd);
      if (node && node.children) {
        if (!node.children[fn]) node.children[fn] = { type: 'file', content: '' };
        renderTermFS();
      }
      break;
    }
    case 'mkdir': {
      if (!args[0]) {
        termPrint('<span class="t-out err">mkdir: missing operand</span>');
        return;
      }
      const dn = args[0];
      const node = getNode(termCwd);
      if (node && node.children) {
        if (node.children[dn]) {
          termPrint(`<span class="t-out err">mkdir: cannot create directory '${escHTML(dn)}': File exists</span>`);
          return;
        }
        node.children[dn] = { type: 'dir', children: {} };
        renderTermFS();
      }
      break;
    }
    case 'rm': {
      if (!args[0]) {
        termPrint('<span class="t-out err">rm: missing operand</span>');
        return;
      }
      const fn = args.filter((a) => !a.startsWith('-'))[0];
      const recursive = args.includes('-r') || args.includes('-rf') || args.includes('-R');
      const fp = resolvePath(fn, termCwd);
      const parentPath = fp.split('/').slice(0, -1).join('/') || '/';
      const fname = fp.split('/').pop();
      const parent = getNode(parentPath);
      if (!parent || !parent.children || !parent.children[fname]) {
        termPrint(`<span class="t-out err">rm: cannot remove '${escHTML(fn)}': No such file or directory</span>`);
        return;
      }
      if (parent.children[fname].type === 'dir' && !recursive) {
        termPrint(`<span class="t-out err">rm: cannot remove '${escHTML(fn)}': Is a directory (use -r)</span>`);
        return;
      }
      delete parent.children[fname];
      renderTermFS();
      break;
    }
    case 'rmdir': {
      if (!args[0]) {
        termPrint('<span class="t-out err">rmdir: missing operand</span>');
        return;
      }
      const fp = resolvePath(args[0], termCwd);
      const parentPath = fp.split('/').slice(0, -1).join('/') || '/';
      const dname = fp.split('/').pop();
      const parent = getNode(parentPath);
      if (!parent || !parent.children || !parent.children[dname]) {
        termPrint(`<span class="t-out err">rmdir: failed to remove '${escHTML(args[0])}': No such file or directory</span>`);
        return;
      }
      const dn = parent.children[dname];
      if (dn.type !== 'dir') {
        termPrint(`<span class="t-out err">rmdir: failed to remove '${escHTML(args[0])}': Not a directory</span>`);
        return;
      }
      if (Object.keys(dn.children || {}).length > 0) {
        termPrint(`<span class="t-out err">rmdir: failed to remove '${escHTML(args[0])}': Directory not empty</span>`);
        return;
      }
      delete parent.children[dname];
      renderTermFS();
      break;
    }
    case 'cp': {
      if (args.length < 2) {
        termPrint('<span class="t-out err">cp: missing destination file operand</span>');
        return;
      }
      const src = resolvePath(args[0], termCwd), dst = resolvePath(args[1], termCwd);
      const srcNode = getNode(src);
      if (!srcNode) {
        termPrint(`<span class="t-out err">cp: cannot stat '${escHTML(args[0])}': No such file or directory</span>`);
        return;
      }
      let dstParent, dstName;
      const dstNode = getNode(dst);
      if (dstNode && dstNode.type === 'dir') {
        dstParent = dstNode;
        dstName = src.split('/').pop();
      } else {
        dstParent = getNode(dst.split('/').slice(0, -1).join('/') || '/');
        dstName = dst.split('/').pop();
      }
      if (!dstParent) {
        termPrint(`<span class="t-out err">cp: cannot create '${escHTML(args[1])}'</span>`);
        return;
      }
      dstParent.children[dstName] = JSON.parse(JSON.stringify(srcNode));
      renderTermFS();
      break;
    }
    case 'mv': {
      if (args.length < 2) {
        termPrint('<span class="t-out err">mv: missing destination file operand</span>');
        return;
      }
      const src = resolvePath(args[0], termCwd), dst = resolvePath(args[1], termCwd);
      const srcParent = getNode(src.split('/').slice(0, -1).join('/') || '/');
      const srcName = src.split('/').pop();
      const srcNode = srcParent && srcParent.children && srcParent.children[srcName];
      if (!srcNode) {
        termPrint(`<span class="t-out err">mv: cannot stat '${escHTML(args[0])}': No such file or directory</span>`);
        return;
      }
      let dstParent, dstName;
      const dstNode = getNode(dst);
      if (dstNode && dstNode.type === 'dir') {
        dstParent = dstNode;
        dstName = srcName;
      } else {
        dstParent = getNode(dst.split('/').slice(0, -1).join('/') || '/');
        dstName = dst.split('/').pop();
      }
      if (!dstParent) {
        termPrint(`<span class="t-out err">mv: cannot move to '${escHTML(args[1])}'</span>`);
        return;
      }
      dstParent.children[dstName] = srcNode;
      delete srcParent.children[srcName];
      renderTermFS();
      break;
    }
    case 'grep': {
      if (args.length < 2) {
        termPrint('<span class="t-out err">grep: usage: grep [pattern] [file]</span>');
        return;
      }
      const pattern = args[0], fileName = args[1];
      const fp = resolvePath(fileName, termCwd);
      const node = getNode(fp);
      if (!node || node.type !== 'file') {
        termPrint(`<span class="t-out err">grep: ${escHTML(fileName)}: No such file</span>`);
        return;
      }
      const matches = (node.content || '').split('\n').filter((l) => l.includes(pattern));
      if (!matches.length) termPrint(`<span class="t-out dim">(no matches for '${escHTML(pattern)}')</span>`);
      else matches.forEach((l) => termPrint(`<span class="t-out ok">${escHTML(l)}</span>`));
      break;
    }
    case 'wc': {
      if (!args[0]) {
        termPrint('<span class="t-out err">wc: missing operand</span>');
        return;
      }
      const fp = resolvePath(args[0].replace(/^-\w+\s*/, ''), termCwd);
      const node = getNode(fp);
      if (!node || node.type !== 'file') {
        termPrint(`<span class="t-out err">wc: ${escHTML(args[0])}: No such file</span>`);
        return;
      }
      const c = node.content || '';
      const lines = c.split('\n').length;
      const words = c.trim().split(/\s+/).filter(Boolean).length;
      termPrint(`<span class="t-out">${lines} ${words} ${c.length} ${escHTML(args[args.length - 1])}</span>`);
      break;
    }
    case 'sort': {
      if (!args[0]) {
        termPrint('<span class="t-out err">sort: missing operand</span>');
        return;
      }
      const fp = resolvePath(args[0], termCwd); const node = getNode(fp);
      if (!node || node.type !== 'file') {
        termPrint(`<span class="t-out err">sort: ${escHTML(args[0])}: No such file</span>`);
        return;
      }
      (node.content || '').split('\n').filter(Boolean).sort().forEach((l) => termPrint(`<span class="t-out">${escHTML(l)}</span>`));
      break;
    }
    case 'head': {
      const n = parseInt((args.find((a) => a.startsWith('-n')) || '-n10').replace('-n', '')) || 10;
      const fn = args.filter((a) => !a.startsWith('-'))[0];
      if (!fn) {
        termPrint('<span class="t-out err">head: missing operand</span>');
        return;
      }
      const fp = resolvePath(fn, termCwd); const node = getNode(fp);
      if (!node || node.type !== 'file') {
        termPrint(`<span class="t-out err">head: ${escHTML(fn)}: No such file</span>`);
        return;
      }
      (node.content || '').split('\n').slice(0, n).forEach((l) => termPrint(`<span class="t-out">${escHTML(l)}</span>`));
      break;
    }
    case 'tail': {
      const n = parseInt((args.find((a) => a.startsWith('-n')) || '-n10').replace('-n', '')) || 10;
      const fn = args.filter((a) => !a.startsWith('-'))[0];
      if (!fn) {
        termPrint('<span class="t-out err">tail: missing operand</span>');
        return;
      }
      const fp = resolvePath(fn, termCwd); const node = getNode(fp);
      if (!node || node.type !== 'file') {
        termPrint(`<span class="t-out err">tail: ${escHTML(fn)}: No such file</span>`);
        return;
      }
      const ls = (node.content || '').split('\n');
      ls.slice(-n).forEach((l) => termPrint(`<span class="t-out">${escHTML(l)}</span>`));
      break;
    }
    case 'find': {
      const startPath = args[0] ? resolvePath(args[0], termCwd) : termCwd;
      const nameArg = args.indexOf('-name');
      const pattern = nameArg >= 0 ? args[nameArg + 1] : '*';
      const results = [];
      function fr(path, nd) {
        if (!nd) return;
        const nm = path.split('/').pop();
        if (!nm) return;
        if (pattern === '*' || nm.includes(pattern.replace(/\*/g, ''))) results.push(path);
        if (nd.type === 'dir') Object.entries(nd.children || {}).forEach(([k, v]) => fr(`${path}/${k}`.replace('//', '/'), v));
      }
      fr(startPath, getNode(startPath));
      if (results.length) results.forEach((r) => termPrint(`<span class="t-out">${escHTML(r)}</span>`));
      else termPrint('<span class="t-out dim">(no results)</span>');
      break;
    }
    case 'python3':
    case 'python': {
      if (!args[0]) {
        termPrint('<span class="t-out warn">Python 3.11.0 (simulated)</span><span class="t-out dim">>>> (interactive mode not supported — run a file: python3 filename.py)</span>');
        return;
      }
      const fp = resolvePath(args[0], termCwd); const node = getNode(fp);
      if (!node) {
        termPrint(`<span class="t-out err">python3: can't open file '${escHTML(args[0])}': [Errno 2] No such file or directory</span>`);
        return;
      }
      const code = node.content || '';
      const out = simPython(code);
      out.split('\n').forEach((l) => l && termPrint(`<span class="t-out ok">${escHTML(l)}</span>`));
      break;
    }
    case 'node':
    case 'nodejs': {
      if (!args[0]) {
        termPrint('<span class="t-out warn">Node.js v20.0.0 (simulated)</span><span class="t-out dim">> (REPL not supported — run: node filename.js)</span>');
        return;
      }
      const fp = resolvePath(args[0], termCwd); const node = getNode(fp);
      if (!node) {
        termPrint(`<span class="t-out err">Error: Cannot find module '${escHTML(args[0])}'</span>`);
        return;
      }
      const code = node.content || '';
      simJS(code).split('\n').forEach((l) => l && termPrint(`<span class="t-out ok">${escHTML(l)}</span>`));
      break;
    }
    case 'gcc':
    case 'g++': {
      const files = args.filter((a) => !a.startsWith('-'));
      const out = args[args.indexOf('-o') + 1] || 'a.out';
      if (!files[0]) {
        termPrint(`<span class="t-out err">${command}: fatal error: no input files</span>`);
        return;
      }
      const fp = resolvePath(files[0], termCwd); const node = getNode(fp);
      if (!node) {
        termPrint(`<span class="t-out err">${command}: ${escHTML(files[0])}: No such file or directory</span>`);
        return;
      }
      const pDir = getNode(termCwd);
      if (pDir && pDir.children) pDir.children[out] = { type: 'file', content: `[binary: ${out}]` };
      termPrint(`<span class="t-out ok">Compiled successfully → ${escHTML(out)}</span>`);
      renderTermFS();
      break;
    }
    case 'javac': {
      const files = args.filter((a) => !a.startsWith('-'));
      if (!files[0]) {
        termPrint('<span class="t-out err">javac: missing source files</span>');
        return;
      }
      termPrint(`<span class="t-out ok">Compiled ${escHTML(files[0])} successfully</span>`);
      break;
    }
    case 'java': {
      termPrint('<span class="t-out warn">Java execution is simulated</span>');
      termPrint('<span class="t-out ok">Hello from Java!</span>');
      break;
    }
    case 'history': {
      if (!termHistory.length) {
        termPrint('<span class="t-out dim">(no history)</span>');
        return;
      }
      termHistory.slice().reverse().forEach((h, i) => termPrint(`<span class="t-out dim">${String(i + 1).padStart(4)}</span>  <span class="t-out">${escHTML(h)}</span>`));
      break;
    }
    case 'which': {
      const builtins = ['ls', 'cd', 'pwd', 'cat', 'touch', 'mkdir', 'rm', 'rmdir', 'cp', 'mv', 'echo', 'grep', 'wc', 'sort', 'head', 'tail', 'python3', 'node', 'gcc', 'g++', 'javac', 'java', 'history', 'clear', 'help', 'whoami', 'date', 'uname', 'ps', 'env', 'find', 'which'];
      if (!args[0]) {
        termPrint('<span class="t-out err">which: missing argument</span>');
        return;
      }
      if (builtins.includes(args[0])) termPrint(`<span class="t-out">/usr/bin/${escHTML(args[0])}</span>`);
      else termPrint(`<span class="t-out err">${escHTML(args[0])} not found</span>`);
      break;
    }
    case 'chmod': termPrint('<span class="t-out ok">chmod: mode changed (simulated)</span>'); break;
    case 'df':
      termPrint('<span class="t-out">Filesystem      Size  Used Avail Use% Mounted on</span>');
      termPrint('<span class="t-out">/dev/sda1        50G  12G   38G  24% /</span>');
      termPrint('<span class="t-out">tmpfs           2.0G    0  2.0G   0% /dev/shm</span>');
      break;
    case 'du':
      termPrint(`<span class="t-out">4.0K\t${escHTML(termCwd)}</span>`);
      break;
    case 'diff': {
      if (args.length < 2) {
        termPrint('<span class="t-out err">diff: missing operand</span>');
        return;
      }
      const f1 = getNode(resolvePath(args[0], termCwd)), f2 = getNode(resolvePath(args[1], termCwd));
      if (!f1 || !f2) {
        termPrint('<span class="t-out err">diff: file not found</span>');
        return;
      }
      if ((f1.content || '') === (f2.content || '')) termPrint('<span class="t-out dim">(files are identical)</span>');
      else termPrint('<span class="t-out warn">(files differ)</span>');
      break;
    }
    case 'export':
    case 'alias':
    case 'unalias':
      termPrint(`<span class="t-out ok">${escHTML(command)}: ${escHTML(args.join(' '))} (simulated)</span>`);
      break;
    case 'man':
      if (!args[0]) termPrint('<span class="t-out err">man: missing argument</span>');
      else termPrint(`<span class="t-out info">Manual for '${escHTML(args[0])}': Type 'help' for a built-in command list.</span>`);
      break;
    case 'nano':
    case 'vim':
    case 'vi':
      termPrint(`<span class="t-out warn">${command}: text editors are not supported in this terminal.</span>`);
      termPrint('<span class="t-out dim">Tip: Use the Compiler section to edit and run code.</span>');
      break;
    default:
      termPrint(`<span class="t-out err">bash: ${escHTML(command)}: command not found</span>`);
      termPrint('<span class="t-out dim">Type <span style="color:var(--accent)">help</span> for available commands.</span>');
  }

  if (output !== undefined && output !== '') {
    if (outFile) {
      setFileContent(outFile, output + '\n');
      renderTermFS();
    } else if (appendFile) {
      setFileContent(appendFile, (getFileContent(appendFile) || '') + output + '\n');
      renderTermFS();
    } else output.split('\n').forEach((l) => termPrint(`<span class="t-out">${escHTML(l)}</span>`));
  }
}

function captureTerm(cmd) {
  const parts = cmd.trim().split(/\s+/); const command = parts[0]; const args = parts.slice(1);
  if (command === 'ls') {
    const node = getNode(termCwd);
    if (!node || !node.children) return '';
    return Object.keys(node.children).join('\n');
  }
  if (command === 'cat') {
    const fp = resolvePath(args[0] || '', termCwd); const node = getNode(fp);
    return (node && node.content) || '';
  }
  if (command === 'pwd') return termCwd;
  if (command === 'echo') return args.join(' ');
  return '';
}

function getFileContent(name) {
  const fp = resolvePath(name, termCwd); const node = getNode(fp);
  return node && node.type === 'file' ? node.content : null;
}

function setFileContent(name, content) {
  const fp = resolvePath(name, termCwd);
  const parentPath = fp.split('/').slice(0, -1).join('/') || '/';
  const fname = fp.split('/').pop();
  const parent = getNode(parentPath);
  if (parent && parent.children) parent.children[fname] = { type: 'file', content };
}

function simPython(code) {
  if (/print\(["'](.+?)["']\)/.test(code)) {
    const m = code.match(/print\(["'](.+?)["']\)/g);
    return m.map((s) => s.replace(/print\(["'](.+?)["']\)/, '$1')).join('\n');
  }
  if (/for.*range.*:/.test(code) && /print/.test(code)) return Array.from({ length: 5 }, (_, i) => i).join('\n');
  if (/fib/i.test(code)) {
    const f = [0, 1];
    for (let i = 2; i < 10; i++) f.push(f[i - 1] + f[i - 2]);
    return f.join('\n');
  }
  if (/factorial/i.test(code)) return '120';
  if (/print\(sum/.test(code)) return '15';
  return '(program output)';
}

function simJS(code) {
  if (/console\.log\(["'](.+?)["']\)/.test(code)) {
    const m = code.match(/console\.log\(["'](.+?)["']\)/);
    return m ? m[1] : '';
  }
  if (/reduce.*\+/.test(code)) return '15';
  return '(program output)';
}

function clearTerm() {
  document.getElementById('term-output').innerHTML = '';
  termPrint('<span class="t-out dim">Terminal cleared. Type <span style="color:var(--accent)">help</span> for commands.</span>');
}

function termHelp() {
  const cmds = [
    ['File System', ''], ['ls [-la] [dir]', 'list directory contents'], ['cd <dir>', 'change directory (use ~ for home)'], ['pwd', 'print working directory'], ['cat <file>', 'view file contents'], ['touch <file>', 'create empty file'], ['mkdir <dir>', 'create directory'], ['rm [-r] <file>', 'remove file or directory'], ['rmdir <dir>', 'remove empty directory'], ['cp <src> <dst>', 'copy file'], ['mv <src> <dst>', 'move or rename'], ['', ''], ['Search & Text', ''], ['grep <pat> <file>', 'search for pattern in file'], ['wc <file>', 'count lines, words, chars'], ['sort <file>', 'sort lines alphabetically'], ['head/tail [-n] <f>', 'show first/last N lines'], ['find <dir> -name', 'find files by name'], ['diff <f1> <f2>', 'compare two files'], ['', ''], ['Run Code', ''], ['python3 <file>', 'run a Python file'], ['node <file>', 'run a JavaScript file'], ['gcc <file> -o out', 'compile C file'], ['g++ <file> -o out', 'compile C++ file'], ['javac <file>', 'compile Java file'], ['', ''], ['Pipes & Redirects', ''], ['cmd | grep <p>', 'pipe to grep'], ['cmd | wc -l', 'pipe to wc'], ['echo txt > file', 'write to file'], ['echo txt >> file', 'append to file'], ['', ''], ['System', ''], ['whoami', 'current user'], ['date', 'current date/time'], ['uname -a', 'system information'], ['ps', 'running processes'], ['env', 'environment variables'], ['df / du', 'disk usage'], ['history', 'command history'], ['which <cmd>', 'find command path'], ['clear / Ctrl+L', 'clear terminal'], ['help', 'show this help']
  ];
  termPrint('<span class="t-out info">╔══════════════ CodeArena Terminal Help ══════════════╗</span>');
  cmds.forEach(([k, v]) => {
    if (!k && !v) { termPrint(''); return; }
    if (!v) { termPrint(`<span class="t-out warn">  ── ${k} ──</span>`); return; }
    termPrint(`<span class="t-out"><span class="cmd-k" style="display:inline-block;width:180px;color:var(--accent)">${escHTML(k)}</span><span style="color:var(--muted)">${escHTML(v)}</span></span>`);
  });
  termPrint('<span class="t-out info">╚═════════════════════════════════════════════════════╝</span>');
}

function addTTab() {
  const id = termTabCount++;
  termTabs.push({ id, cwd: '/home/user' });
  const bar = document.getElementById('term-tabs');
  const addBtn = bar.querySelector('.add-tab-btn');
  const tab = document.createElement('div');
  tab.className = 'term-tab';
  tab.id = `ttab-${id}`;
  tab.innerHTML = `<span>bash — ~</span><span class="term-tab-close" onclick="closeTTab(event,${id})">✕</span>`;
  tab.onclick = () => switchTTab(id);
  bar.insertBefore(tab, addBtn);
  switchTTab(id);
  showToast('New terminal tab', '');
}

function switchTTab(id) {
  activeTTab = id;
  document.querySelectorAll('.term-tab').forEach((t) => t.classList.remove('active'));
  const el = document.getElementById(`ttab-${id}`);
  if (el) el.classList.add('active');
}

function closeTTab(e, id) {
  e.stopPropagation();
  if (termTabs.length <= 1) {
    showToast('Cannot close last tab', 'error');
    return;
  }
  const el = document.getElementById(`ttab-${id}`);
  if (el) el.remove();
  termTabs = termTabs.filter((t) => t.id !== id);
  if (activeTTab === id) switchTTab(termTabs[0].id);
}

function renderTermFS() {
  const el = document.getElementById('term-fs');
  if (!el) return;
  function renderDir(path, node, depth) {
    if (!node || node.type !== 'dir') return '';
    return Object.entries(node.children || {}).map(([k, v]) => {
      const icon = v.type === 'dir' ? '📁' : k.endsWith('.py') ? '🐍' : k.endsWith('.js') ? '📜' : k.endsWith('.cpp') || k.endsWith('.c') ? '⚙️' : k.endsWith('.md') ? '📄' : '📄';
      const cls = v.type === 'dir' ? 'f-dir' : k.endsWith('.py') ? 'f-py' : k.endsWith('.js') ? 'f-js' : k.endsWith('.cpp') ? 'f-cpp' : k.endsWith('.c') ? 'f-c' : 'f-txt';
      const depCls = depth === 1 ? 'd1' : depth >= 2 ? 'd2' : '';
      const fp = `${path}/${k}`;
      if (v.type === 'dir') return `<div class="fs-item ${cls} ${depCls}" onclick="cdTerm('${fp}')">${icon} ${k}/</div>` + renderDir(fp, v, depth + 1);
      return `<div class="fs-item ${cls} ${depCls}" onclick="catTerm('${fp}')">${icon} ${k}</div>`;
    }).join('');
  }
  const userNode = getNode('/home/user');
  el.innerHTML = `<div class="fs-item f-dir" onclick="cdTerm('/home/user')">🏠 ~/</div>` + renderDir('/home/user', userNode, 1);
}

function cdTerm(path) {
  termCwd = path;
  document.getElementById('term-path-label').textContent = `:${shortPath(termCwd)}$`;
  document.getElementById('term-title').textContent = `user@codearena: ${shortPath(termCwd)}`;
  termPrintCmd(`cd ${shortPath(path)}`);
  termPrint(`<span class="t-out dim">Changed to ${escHTML(shortPath(path))}</span>`);
  renderTermFS();
  document.getElementById('term-input').focus();
}

function catTerm(path) {
  const node = getNode(path);
  if (!node || node.type !== 'file') return;
  const name = path.split('/').pop();
  termPrintCmd(`cat ${name}`);
  (node.content || '').split('\n').forEach((l) => termPrint(`<span class="t-out">${escHTML(l)}</span>`));
  document.getElementById('term-input').focus();
}

function openModal(n) { document.getElementById('modal-' + n).classList.add('open'); }
function closeModal(n) { document.getElementById('modal-' + n).classList.remove('open'); }
document.querySelectorAll('.modal-overlay').forEach((o) => o.addEventListener('click', (e) => { if (e.target === o) o.classList.remove('open'); }));
function fakeAuth(t) { closeModal(t === 'login' ? 'login' : 'register'); showToast(t === 'login' ? 'Signed in successfully!' : 'Account created! Welcome.', 'success'); }

function showToast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'show ' + (type || '');
  setTimeout(() => { t.className = type || ''; }, 3000);
}

function loadBar(pct) { document.getElementById('loadbar').style.width = (pct * 100) + '%'; }

document.addEventListener('DOMContentLoaded', () => {
  renderProblems();
  const ed = document.getElementById('code-editor');
  if (ed) ed.addEventListener('scroll', () => { document.getElementById('line-numbers').scrollTop = ed.scrollTop; });
  const ct = document.getElementById('comp-textarea');
  if (ct) ct.addEventListener('scroll', () => { document.getElementById('comp-lnums').scrollTop = ct.scrollTop; });
  const tw = document.querySelector('.term-window');
  if (tw) tw.addEventListener('click', () => { const i = document.getElementById('term-input'); if (i) i.focus(); });
});
