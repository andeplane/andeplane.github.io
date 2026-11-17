import { describe, expect, it } from "vitest";
import { PACKS, SAVE_KEY, freshProgress } from "./academy";
import {
  LANGUAGES, LANGUAGE_KEY, createI18n, detectLanguage,
  readLanguagePreference, saveLanguagePreference,
} from "./i18n";
import { catalogs, en } from "./messages";

describe("Captain Calculus language selection", () => {
  it.each([
    [["nb-NO"], "nb"], [["no-NO"], "nb"], [["nn-NO"], "nb"],
    [["sv-SE"], "sv"], [["da-DK"], "da"], [["fi-FI"], "fi"],
    [["de-AT"], "de"], [["es-MX"], "es"], [["fr-CA"], "fr"],
    [["en-AU"], "en"], [["ja-JP", "de-DE", "en"], "de"],
    [["en-US", "nb-NO"], "en"], [[" NB_no "], "nb"],
    [["zh-CN"], "en"], [[], "en"],
  ])("detects %j as %s", (languages, expected) => {
    expect(detectLanguage(languages)).toBe(expected);
  });

  it("lets a saved choice override device language and lets automatic restore it", () => {
    expect(createI18n("de", ["nb-NO"]).language).toBe("de");
    expect(createI18n("auto", ["nb-NO"]).language).toBe("nb");
  });

  it("persists only the language key without touching existing game saves", () => {
    const save = JSON.stringify(freshProgress());
    const data = new Map([[SAVE_KEY, save], ["broadside.progress", "sailing save"]]);
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
    expect(readLanguagePreference(storage)).toBe("auto");
    expect(saveLanguagePreference("fi", storage)).toBe(true);
    expect(readLanguagePreference(storage)).toBe("fi");
    expect(data.get(SAVE_KEY)).toBe(save);
    expect(data.get("broadside.progress")).toBe("sailing save");
    expect(saveLanguagePreference("auto", storage)).toBe(true);
    expect(readLanguagePreference(storage)).toBe("auto");
    data.set(LANGUAGE_KEY, "invalid");
    expect(readLanguagePreference(storage)).toBe("auto");
  });

  it("still plays when storage is missing or blocked", () => {
    const blocked = { getItem: () => { throw Error("blocked"); }, setItem: () => { throw Error("blocked"); } };
    expect(readLanguagePreference()).toBe("auto");
    expect(readLanguagePreference(blocked)).toBe("auto");
    expect(saveLanguagePreference("nb")).toBe(false);
    expect(saveLanguagePreference("nb", blocked)).toBe(false);
  });
});

describe("complete translations", () => {
  const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
  for (const { id } of LANGUAGES) {
    it(`${id} covers every message and preserves interpolation fields`, () => {
      expect(Object.keys(catalogs[id]).sort()).toEqual(Object.keys(en).sort());
      for (const key of Object.keys(en) as (keyof typeof en)[]) {
        expect(catalogs[id][key].trim(), `${id}.${key}`).not.toBe("");
        expect(placeholders(catalogs[id][key]), `${id}.${key}`).toEqual(placeholders(en[key]));
      }
    });
    it(`${id} describes every difficulty and operator without unresolved fields`, () => {
      const i18n = createI18n(id, []);
      for (const pack of PACKS) {
        const localized = i18n.packText(pack);
        expect(localized.name).toBeTruthy();
        expect(localized.label).toBeTruthy();
        expect(localized.description).toBeTruthy();
        expect(JSON.stringify(localized)).not.toMatch(/\{\w+\}|undefined/);
        expect(i18n.operatorName(pack.operator)).toBeTruthy();
        expect(i18n.operatorVerb(pack.operator)).toBeTruthy();
        expect(i18n.spokenOperator(pack.operator)).toBeTruthy();
      }
    });
  }

  it("uses locale number separators and singular/plural rules", () => {
    const german = createI18n("de", []), french = createI18n("fr", []);
    expect(german.format(12345)).toBe("12.345");
    expect(german.compactGold(1000)).toBe("1.000");
    expect(german.plural("answersLeft", 1)).toContain("1 Antwort bis");
    expect(german.plural("answersLeft", 2)).toContain("2 Antworten bis");
    expect(french.plural("hoard", 0, { solved: 0 })).toContain("0 coffre gagné");
    expect(french.plural("hoard", 2, { solved: 20 })).toContain("2 coffres gagnés");
    expect(german.t("hintDivide", { left: 12, groups: 3 })).toContain("12 Münzen auf 3 Mannschaften");
  });
});
