type Props = {
  title: string;
  subtitle?: string;
  imageUrl?: string;
  imageAlt?: string;
  caption?: string;
  paragraphs: string[];
};

export function CbsArticle({
  title,
  subtitle,
  imageUrl,
  imageAlt,
  caption,
  paragraphs,
}: Props) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      {subtitle ? (
        <div className="text-xs font-extrabold uppercase tracking-wide text-[#0076B6]">
          {subtitle}
        </div>
      ) : null}

      <h2 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">
        {title}
      </h2>

      {imageUrl ? (
        <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
          <img src={imageUrl} alt={imageAlt ?? title} className="h-64 w-full object-cover" />
          {caption ? (
            <div className="border-t border-slate-200 px-4 py-2 text-sm text-slate-700">
              {caption}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 space-y-4 text-[18px] leading-8 text-slate-900">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </article>
  );
}
