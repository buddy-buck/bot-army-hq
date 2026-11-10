// Testimonials live in public/testimonials.json so anyone can add one by
// editing that file (no code, no rebuild). The Visitor Center guest book
// rotates them and the pier mailbox mixes them in as shoutouts.
//
// File shape: { "testimonials": [ { "quote": "...", "who": "..." } ] }
// (a bare array of the same objects works too). Bad or missing entries are
// skipped; if the file can't load, the built-in list below is used.

export const DEFAULT_TESTIMONIALS = [
  { quote: 'My listing captions write themselves now. I just sip my coffee.', who: 'Happy BYOB owner, Duvall' },
  { quote: 'Got two hours of my Tuesday back. Spent them on the river.', who: 'Weekend kayaker, Carnation' },
  { quote: 'The bots never forget a follow-up. I used to forget lunch.', who: 'Busy agent, Monroe' },
  { quote: 'They drafted my newsletter before my latte cooled.', who: 'Small business owner, Fall City' },
  { quote: 'Tiny robots, huge help. Would visit the island again.', who: 'First-time visitor, Snoqualmie' },
  { quote: 'Best part? They wave at you on the paths.', who: 'Island regular, Woodinville' },
];

const clean = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export function parseTestimonials(json) {
  const list = Array.isArray(json) ? json : Array.isArray(json?.testimonials) ? json.testimonials : [];
  const out = [];
  for (const t of list) {
    const quote = clean(t?.quote, 220);
    if (!quote) continue;
    out.push({ quote, who: clean(t?.who, 80) || 'A happy visitor' });
  }
  return out;
}

let pending = null;
export function loadTestimonials() {
  if (!pending) {
    const url = `${import.meta.env.BASE_URL}testimonials.json`;
    pending = fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const list = parseTestimonials(j);
        return list.length ? list : DEFAULT_TESTIMONIALS;
      })
      .catch(() => DEFAULT_TESTIMONIALS);
  }
  return pending;
}
