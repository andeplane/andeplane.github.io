import type { Language } from "../i18n/languages";
import { commonCatalogs, type CommonMessage } from "../i18n/messages";

type SettingsMessage = "sounds" | "soundNote" | "model" | "adaptation" | "cabinAdaptation" | "licensedModel";

export const broadsideCatalogs = {
  en: { ...commonCatalogs.en, cabinAdaptation: "Cabin and treasure display adapted for Broadside.", licensedModel: "licensed model.", sounds: "Coin sound effects", soundNote: "Clinks when coins tumble and land.", model: "Black Pearl model by", adaptation: "Adapted for Broadside." },
  nb: { ...commonCatalogs.nb, cabinAdaptation: "Lugaren og skatteutstillingen er tilpasset for Broadside.", licensedModel: "lisensiert modell.", sounds: "Myntlyder", soundNote: "Myntene klirrer når de faller og lander.", model: "Black Pearl-modell av", adaptation: "Tilpasset for Broadside." },
  sv: { ...commonCatalogs.sv, cabinAdaptation: "Kajutan och skattutställningen har anpassats för Broadside.", licensedModel: "licensierad modell.", sounds: "Myntljud", soundNote: "Mynten klingar när de faller och landar.", model: "Black Pearl-modell av", adaptation: "Anpassad för Broadside." },
  da: { ...commonCatalogs.da, cabinAdaptation: "Kahytten og skatteudstillingen er tilpasset til Broadside.", licensedModel: "licenseret model.", sounds: "Møntlyde", soundNote: "Mønterne klirrer, når de falder og lander.", model: "Black Pearl-model af", adaptation: "Tilpasset til Broadside." },
  fi: { ...commonCatalogs.fi, cabinAdaptation: "Hytti ja aarteen esillepano on muokattu Broadside-peliin.", licensedModel: "lisensoitu malli.", sounds: "Kolikkojen äänet", soundNote: "Kolikot kilisevät pudotessaan.", model: "Black Pearl -mallin tekijä", adaptation: "Muokattu Broadside-peliin." },
  de: { ...commonCatalogs.de, cabinAdaptation: "Kajüte und Schatzpräsentation wurden für Broadside angepasst.", licensedModel: "lizenziertes Modell.", sounds: "Münzgeräusche", soundNote: "Münzen klimpern beim Fallen und Landen.", model: "Black-Pearl-Modell von", adaptation: "Für Broadside angepasst." },
  es: { ...commonCatalogs.es, cabinAdaptation: "El camarote y la exposición del tesoro se adaptaron para Broadside.", licensedModel: "modelo bajo licencia.", sounds: "Sonidos de monedas", soundNote: "Las monedas tintinean al caer.", model: "Modelo del Perla Negra de", adaptation: "Adaptado para Broadside." },
  fr: { ...commonCatalogs.fr, cabinAdaptation: "Cabine et présentation du trésor adaptées pour Broadside.", licensedModel: "modèle sous licence.", sounds: "Son des pièces", soundNote: "Les pièces tintent en tombant.", model: "Modèle du Black Pearl par", adaptation: "Adapté pour Broadside." },
} satisfies Record<Language, Record<CommonMessage | SettingsMessage, string>>;
