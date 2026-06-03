// Renders text with optional per-Chinese-character pinyin shown above each
// Hanzi using native <ruby>. Non-Chinese characters are rendered plain.
import { useMemo } from "react";

const HAN = /\p{Script=Han}/u;

interface Props {
  text: string;
  pinyin?: string[] | null;
  className?: string;
  rubyClassName?: string;
}

export function RubyText({ text, pinyin, className, rubyClassName }: Props) {
  const parts = useMemo(() => {
    if (!pinyin || pinyin.length === 0) return null;
    const out: { c: string; p: string | null }[] = [];
    let pIdx = 0;
    for (const ch of Array.from(text)) {
      if (HAN.test(ch)) {
        out.push({ c: ch, p: pinyin[pIdx] ?? null });
        pIdx++;
      } else {
        out.push({ c: ch, p: null });
      }
    }
    return out;
  }, [text, pinyin]);

  if (!parts) return <span className={className}>{text}</span>;

  return (
    <span className={className}>
      {parts.map((seg, i) =>
        seg.p ? (
          <ruby key={i} className={rubyClassName}>
            {seg.c}
            <rt className="text-[0.55em] font-normal text-muted-foreground">
              {seg.p}
            </rt>
          </ruby>
        ) : (
          <span key={i}>{seg.c}</span>
        ),
      )}
    </span>
  );
}
