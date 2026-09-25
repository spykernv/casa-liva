/**
 * Apprend à Node l'alias `@/` du projet, pour que les scripts de
 * vérification puissent charger les **vrais** modules.
 *
 *   node --import ./scripts/alias-hook.mjs scripts/verify-dates.mjs
 *
 * **Pourquoi ce fichier existe.** `verify:ai` importe déjà du
 * TypeScript tel quel (`../lib/calendar/visible.ts`) : Node 24 efface
 * les types tout seul. Mais il ne sait le faire que sur les deux
 * modules qui n'importent rien d'autre. Dès qu'un module écrit
 * `import { casaDate } from "@/lib/date"`, Node échoue — l'alias est
 * une convention de `tsconfig.json`, que lui ne lit pas. Or c'est
 * exactement le cas de `lib/calendar/layout.ts`, c'est-à-dire du site
 * dont le défaut de JON-60 se voyait le plus.
 *
 * **Pourquoi pas `jiti`.** Il aurait fait le travail sans une ligne à
 * écrire. Mais il aurait aussi introduit une **seconde** façon de
 * charger un module TypeScript dans `scripts/`, à côté de celle que
 * `verify-ai.mjs` utilise déjà — et deux mécanismes pour le même
 * travail finissent toujours par diverger. Ce crochet **prolonge** le
 * mécanisme existant au lieu de le doubler : ce qui s'exécute reste le
 * module de production, dépouillé de ses types par Node lui-même,
 * jamais réécrit par un transpileur tiers.
 *
 * **Et il ne recopie pas `tsconfig.json`, il le lit.** C'était la
 * seule objection sérieuse à cette solution (JON-69). Le jour où
 * `paths` gagne une entrée, ce fichier la connaît sans qu'on y touche ;
 * le jour où l'alias change, il change ici aussi. Un résolveur qui
 * porterait `"@/" → "./"` en dur, lui, aurait fini par affirmer le
 * contraire du projet sans que rien ne le signale.
 */
import { registerHooks } from "node:module";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve as resolvePath } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Retire les commentaires d'un `tsconfig.json` — que TypeScript
 * accepte et que `JSON.parse` refuse.
 *
 * **En traversant les chaînes, et le détour se démontre.** Le premier
 * jet faisait ça en deux `replace` d'une ligne. Il a mangé le `/*` de
 * `"**\/*.ts"`, au milieu du tableau `include`, et rendu un fichier
 * illisible — le contrôle tombait avant d'avoir contrôlé quoi que ce
 * soit. Trouvé en l'exécutant ; une relecture ne l'aurait pas vu.
 */
function withoutComments(text) {
  let out = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inString) {
      out += c;
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }

    if (c === '"') {
      inString = true;
      out += c;
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (c === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i++;
    } else {
      out += c;
    }
  }

  return out;
}

const tsconfig = JSON.parse(withoutComments(readFileSync(join(root, "tsconfig.json"), "utf8")));

const PATHS = Object.entries(tsconfig.compilerOptions?.paths ?? {});

/* Node exige une extension explicite en ESM ; TypeScript ne l'écrit
   jamais. On essaie donc les formes que le projet utilise, dans
   l'ordre où `moduleResolution: "bundler"` les prendrait. */
const CANDIDATES = ["", ".ts", ".tsx", ".mts", ".js", ".mjs", "/index.ts", "/index.tsx"];

/** Le premier fichier qui existe réellement pour ce chemin sans extension. */
function firstFile(base) {
  for (const suffix of CANDIDATES) {
    const path = base + suffix;
    try {
      if (statSync(path).isFile()) return path;
    } catch {
      // Chemin inexistant : on essaie la forme suivante.
    }
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    for (const [pattern, targets] of PATHS) {
      if (!pattern.endsWith("*")) continue;
      const prefix = pattern.slice(0, -1);
      if (!specifier.startsWith(prefix)) continue;

      const rest = specifier.slice(prefix.length);
      for (const target of targets) {
        const found = firstFile(resolvePath(root, target.replace(/\*$/, "") + rest));
        if (found) return { url: pathToFileURL(found).href, shortCircuit: true };
      }
    }

    /* Les imports relatifs sans extension (`./intervals`) échouent de
       la même façon, et pour la même raison. On ne les rattrape
       qu'**après** l'échec du résolveur normal : un module qui se
       résout tout seul doit continuer à le faire. */
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
        const base = resolvePath(dirname(fileURLToPath(context.parentURL)), specifier);
        const found = firstFile(base);
        if (found) return { url: pathToFileURL(found).href, shortCircuit: true };
      }
      throw error;
    }
  },
});
