import "server-only";
import type { MemberColor } from "@/types";

/* ═══════════════════════════════════════════════════════════════
   Le gabarit commun des emails Casa Liva.

   Trois contraintes qui expliquent tout le style de ce fichier, et qui
   n'ont rien à voir avec le reste de l'application :

   1. **Pas de feuille de style.** Gmail retire `<style>` dans une
      partie de ses clients. Tout est en attribut `style=""`, en dur.
   2. **Des tableaux, pas du flex.** Outlook rend le HTML avec le
      moteur de Word ; `flex` et `grid` n'y existent pas.
   3. **Pas de thème sombre automatique.** Les clients qui inversent
      les couleurs le font sur des règles qu'on ne contrôle pas. On
      choisit le clair, et on s'assure que le contraste tient.

   Les couleurs sont recopiées de `globals.css` plutôt qu'importées :
   un email part une fois et vit pour toujours dans une boîte. S'il
   pointait vers des variables CSS, il deviendrait illisible le jour où
   la palette change.
   ═══════════════════════════════════════════════════════════════ */

const INK = "#1f1b17";
const INK_2 = "#6b625a";
const INK_3 = "#9a8f83";
const BG = "#fbf7f1";
const SURFACE = "#ffffff";
const LINE = "#eae1d5";
const ACCENT = "#e2653c";

/** Les huit teintes de membre, figées à la date d'envoi. */
export const MEMBER_HEX: Record<MemberColor, string> = {
  blue: "#2f7fb8",
  green: "#3f9e6b",
  pink: "#dd5f94",
  purple: "#8265cc",
  orange: "#e0813a",
  teal: "#2aa39b",
  red: "#d6543f",
  ochre: "#b98f2c",
};

/** `&` et `<` dans un prénom ou un titre ne doivent pas casser le HTML. */
export function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type ButtonStyle = "primary" | "secondary";

/**
 * Un bouton. En tableau, parce qu'Outlook n'applique ni `padding` ni
 * `border-radius` à un `<a>` — le tableau, si.
 */
export function button(
  label: string,
  href: string,
  style: ButtonStyle = "primary",
): string {
  const bg = style === "primary" ? ACCENT : SURFACE;
  const fg = style === "primary" ? "#ffffff" : INK;
  const border = style === "primary" ? ACCENT : LINE;

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-block;margin:0 6px 8px 0;">
  <tr><td align="center" bgcolor="${bg}" style="border-radius:12px;border:1px solid ${border};">
    <a href="${href}" style="display:inline-block;padding:14px 22px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:16px;font-weight:600;line-height:1;color:${fg};text-decoration:none;">${escape(label)}</a>
  </td></tr>
</table>`;
}

/** Une pastille de couleur suivie d'un prénom — l'identité visuelle du produit. */
export function memberChip(firstName: string, color: MemberColor): string {
  return `<span style="display:inline-block;margin:0 8px 6px 0;padding:5px 11px 5px 9px;border-radius:999px;background:${MEMBER_HEX[color]}1f;color:${INK};font-size:14px;font-weight:600;white-space:nowrap;">
  <span style="display:inline-block;width:9px;height:9px;border-radius:999px;background:${MEMBER_HEX[color]};"></span>&nbsp;${escape(firstName)}</span>`;
}

/** Le bloc « voici l'événement » — réutilisé par l'invitation et les résumés. */
export function eventCard(options: {
  title: string;
  emoji?: string;
  when: string;
  location?: string;
  chips?: string;
  color?: MemberColor;
}): string {
  const bar = options.color ? MEMBER_HEX[options.color] : ACCENT;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;border-collapse:separate;">
  <tr>
    <td width="4" bgcolor="${bar}" style="border-radius:4px 0 0 4px;"></td>
    <td style="padding:16px 18px;background:${SURFACE};border:1px solid ${LINE};border-left:0;border-radius:0 12px 12px 0;">
      <div style="font-size:19px;font-weight:700;color:${INK};line-height:1.3;">${options.emoji ? `${options.emoji} ` : ""}${escape(options.title)}</div>
      <div style="margin-top:5px;font-size:16px;color:${INK_2};">${escape(options.when)}</div>
      ${options.location ? `<div style="margin-top:3px;font-size:15px;color:${INK_2};">${escape(options.location)}</div>` : ""}
      ${options.chips ? `<div style="margin-top:12px;">${options.chips}</div>` : ""}
    </td>
  </tr>
</table>`;
}

export type LayoutOptions = {
  /** La phrase d'accroche, en gros, tout en haut. */
  heading: string;
  body: string;
  /** Où mène « ne plus recevoir ». Absent = envoi non subi. */
  unsubscribeUrl?: string;
  appUrl: string;
};

/**
 * L'enveloppe. `max-width: 560px` parce qu'un email se lit d'abord sur
 * un téléphone, et que 16 px reste le minimum imposé par §48.
 */
export function layout({ heading, body, unsubscribeUrl, appUrl }: LayoutOptions): string {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:${BG};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BG};padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;text-align:left;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <tr><td style="padding-bottom:18px;">
    <a href="${appUrl}" style="font-size:15px;font-weight:700;color:${ACCENT};text-decoration:none;letter-spacing:-0.2px;">Casa Liva</a>
  </td></tr>
  <tr><td style="font-size:23px;font-weight:700;color:${INK};line-height:1.25;padding-bottom:6px;">${escape(heading)}</td></tr>
  <tr><td style="font-size:16px;line-height:1.6;color:${INK_2};">${body}</td></tr>
  <tr><td style="padding-top:28px;border-top:1px solid ${LINE};margin-top:28px;">
    <div style="font-size:13px;line-height:1.6;color:${INK_3};padding-top:14px;">
      Casa Liva — l’agenda de la maison.
      ${unsubscribeUrl ? `<br><a href="${unsubscribeUrl}" style="color:${INK_3};">Ne plus recevoir ces résumés</a>` : ""}
    </div>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}
