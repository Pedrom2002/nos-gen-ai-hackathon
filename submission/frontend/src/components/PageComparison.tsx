import { useSettings } from "@/lib/settings";
import { UI } from "@/lib/i18n-ui";
import type { PageGeometry, RedactionBox } from "@/lib/document";
import { PageStack } from "@/components/PageStack";
import { RiverSlider } from "@/components/RiverSlider";

interface Props { pages: PageGeometry[]; urls: (string | null)[]; redactedUrls?: (string | null)[]; boxes: RedactionBox[]; focusId?: string }

/** The river divider over the document's pages: redacted on the left, original on the right. */
export function PageComparison({ pages, urls, redactedUrls = [], boxes, focusId = "" }: Props) {
  const { t, s } = useSettings();
  const u = UI[s.lang];
  const pageLabel = (n: number) => u.pageN.replace("{n}", String(n));
  return (
    <RiverSlider
      labels={[t.anonymized, t.original]}
      ariaLabel={u.comparison}
      resetKey={focusId}
      before={<PageStack pages={pages} urls={urls} boxes={boxes} mode="original" focusId={focusId} pageLabel={pageLabel} />}
      after={<PageStack pages={pages} urls={urls} redactedUrls={redactedUrls} boxes={boxes} mode="redacted" focusId={focusId} pageLabel={pageLabel} />}
    />
  );
}
