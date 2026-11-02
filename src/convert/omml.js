// Word equations (OMML, the m: elements in document.xml) as LaTeX, which Markdown viewers render
// between $…$ (inline) and $$…$$ (on their own line).

const SYMBOLS = {
  α: 'alpha', β: 'beta', γ: 'gamma', δ: 'delta', ε: 'epsilon', ϵ: 'epsilon', ζ: 'zeta', η: 'eta', θ: 'theta',
  ϑ: 'vartheta', ι: 'iota', κ: 'kappa', λ: 'lambda', μ: 'mu', ν: 'nu', ξ: 'xi', π: 'pi', ρ: 'rho', σ: 'sigma',
  τ: 'tau', υ: 'upsilon', φ: 'phi', ϕ: 'phi', χ: 'chi', ψ: 'psi', ω: 'omega', Γ: 'Gamma', Δ: 'Delta',
  Θ: 'Theta', Λ: 'Lambda', Ξ: 'Xi', Π: 'Pi', Σ: 'Sigma', Υ: 'Upsilon', Φ: 'Phi', Ψ: 'Psi', Ω: 'Omega',
  '×': 'times', '·': 'cdot', '⋅': 'cdot', '÷': 'div', '±': 'pm', '∓': 'mp', '≤': 'le', '≥': 'ge', '≠': 'ne',
  '≈': 'approx', '≡': 'equiv', '∝': 'propto', '∞': 'infty', '→': 'to', '←': 'leftarrow', '⇒': 'Rightarrow',
  '⇔': 'Leftrightarrow', '∈': 'in', '∉': 'notin', '⊂': 'subset', '⊆': 'subseteq', '∪': 'cup', '∩': 'cap',
  '∀': 'forall', '∃': 'exists', '∂': 'partial', '∇': 'nabla', '∘': 'circ', '°': 'circ', '…': 'ldots', '⋯': 'cdots',
};
const FUNCTIONS = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh',
  'tanh', 'log', 'ln', 'exp', 'lim', 'max', 'min', 'sup', 'inf', 'det', 'deg', 'gcd']);
// Longest names first, so "sinh" isn't read as "sin" followed by "h".
const FUNCTION_NAME = new RegExp(`^(${[...FUNCTIONS].sort((a, b) => b.length - a.length).join('|')})(?![A-Za-z])`);
const NARY = { '∑': 'sum', '∏': 'prod', '∐': 'coprod', '∫': 'int', '∬': 'iint', '∭': 'iiint', '∮': 'oint', '⋃': 'bigcup', '⋂': 'bigcap' };
const ACCENTS = { '\u0302': 'hat', '\u0303': 'tilde', '\u0307': 'dot', '\u0308': 'ddot', '\u20d7': 'vec', '\u0305': 'bar', '¯': 'bar', '\u0306': 'breve', '\u030c': 'check' };
const DELIMITERS = { '{': '\\{', '}': '\\}', '‖': '\\|', '⟨': '\\langle', '⟩': '\\rangle', '⌈': '\\lceil', '⌉': '\\rceil', '⌊': '\\lfloor', '⌋': '\\rfloor', '': '.' };

const kids = (el, name) => [...el.children].filter(c => c.localName === name);
const kid = (el, name) => kids(el, name)[0];
// An m:val attribute on a property element, such as <m:begChr m:val="["/>.
const prop = (el, pr, name) => {
  const p = kid(el, pr) && kid(kid(el, pr), name);
  return p ? (p.getAttribute('m:val') ?? p.getAttribute('val')) : null;
};
const arg = el => (el ? `{${children(el)}}` : '{}');

function text(run) {
  const raw = kids(run, 't').map(t => t.textContent).join('').replace(/\u2061/g, '');
  const name = raw.trim();
  const rPr = kid(run, 'rPr');
  const plain = rPr && (kid(rPr, 'nor') || prop(run, 'rPr', 'sty') === 'p');
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    // Function names are upright, whether a run of their own or inside a longer one ("sin θ=").
    const fn = !/[A-Za-z]/.test(raw[i - 1] ?? '') && raw.slice(i).match(FUNCTION_NAME);
    if (fn) {
      out += `\\${fn[1]} `;
      i += fn[1].length - 1;
      continue;
    }
    if (SYMBOLS[ch]) out += `\\${SYMBOLS[ch]} `;
    else if (ch === '−') out += '-';
    else if ('#$%&_{}'.includes(ch)) out += '\\' + ch;
    else if (ch === '\\') out += '\\backslash ';
    else if (ch === '~' || ch === '^') out += `\\${ch === '~' ? 'sim' : 'wedge'} `;
    else out += ch;
  }
  // Words set as plain text in the equation (units such as "mm") stay upright.
  return plain && /^[A-Za-z]{2,}$/.test(name) && !FUNCTIONS.has(name) ? out.replace(name, `\\mathrm{${name}}`) : out;
}

function node(el) {
  switch (el.localName) {
    case 'r': return text(el);
    case 'f': {
      const [num, den] = [arg(kid(el, 'num')), arg(kid(el, 'den'))];
      const type = prop(el, 'fPr', 'type');
      return type === 'lin' ? `${num}/${den}` : type === 'noBar' ? `\\binom${num}${den}` : `\\frac${num}${den}`;
    }
    case 'sSup': return `${arg(kid(el, 'e'))}^${arg(kid(el, 'sup'))}`;
    case 'sSub': return `${arg(kid(el, 'e'))}_${arg(kid(el, 'sub'))}`;
    case 'sSubSup': return `${arg(kid(el, 'e'))}_${arg(kid(el, 'sub'))}^${arg(kid(el, 'sup'))}`;
    case 'sPre': return `{}_${arg(kid(el, 'sub'))}^${arg(kid(el, 'sup'))}${arg(kid(el, 'e'))}`;
    case 'rad': {
      const deg = kid(el, 'deg');
      const hidden = prop(el, 'radPr', 'degHide');
      return deg && hidden !== '1' && hidden !== 'on' && children(deg) ? `\\sqrt[${children(deg)}]${arg(kid(el, 'e'))}` : `\\sqrt${arg(kid(el, 'e'))}`;
    }
    case 'd': {
      const open = prop(el, 'dPr', 'begChr') ?? '(';
      const close = prop(el, 'dPr', 'endChr') ?? ')';
      const sep = prop(el, 'dPr', 'sepChr') ?? '|';
      const inner = kids(el, 'e').map(children).join(sep === '|' ? ' \\mid ' : sep);
      return `\\left${DELIMITERS[open] ?? open}${inner}\\right${DELIMITERS[close] ?? close}`;
    }
    case 'nary': {
      const chr = prop(el, 'naryPr', 'chr') ?? '∫';
      const sub = prop(el, 'naryPr', 'subHide') === '1' ? '' : `_${arg(kid(el, 'sub'))}`;
      const sup = prop(el, 'naryPr', 'supHide') === '1' ? '' : `^${arg(kid(el, 'sup'))}`;
      return `\\${NARY[chr] ?? 'int'}${sub}${sup}${arg(kid(el, 'e'))}`;
    }
    case 'func': return `${children(kid(el, 'fName'))}${arg(kid(el, 'e'))}`;
    case 'limLow': return `${children(kid(el, 'e'))}_${arg(kid(el, 'lim'))}`;
    case 'limUpp': return `${children(kid(el, 'e'))}^${arg(kid(el, 'lim'))}`;
    case 'acc': return `\\${ACCENTS[prop(el, 'accPr', 'chr') ?? '\u0302'] ?? 'hat'}${arg(kid(el, 'e'))}`;
    case 'bar': return `\\${prop(el, 'barPr', 'pos') === 'top' ? 'overline' : 'underline'}${arg(kid(el, 'e'))}`;
    case 'groupChr': return `\\${prop(el, 'groupChrPr', 'pos') === 'top' ? 'overbrace' : 'underbrace'}${arg(kid(el, 'e'))}`;
    case 'borderBox': return `\\boxed${arg(kid(el, 'e'))}`;
    case 'eqArr': return `\\begin{aligned}${kids(el, 'e').map(children).join(' \\\\ ')}\\end{aligned}`;
    case 'm': return `\\begin{matrix}${kids(el, 'mr').map(r => kids(r, 'e').map(children).join(' & ')).join(' \\\\ ')}\\end{matrix}`;
    default: return el.localName.endsWith('Pr') ? '' : children(el);
  }
}

const children = el => (el ? [...el.children].map(node).join('') : '');

// LaTeX for one <m:oMath>, tidied: no space before a closing brace or at the ends.
export const ommlToLatex = el => children(el).replace(/ +/g, ' ').replace(/ ([}^_)])/g, '$1').trim();
