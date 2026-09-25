"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HOUR_HEIGHT, type ShiftMode } from "@/lib/calendar/layout";

/* ═══════════════════════════════════════════════════════════════
   Déplacer et redimensionner un événement au doigt.

   Deux contraintes décident de toute l'implémentation :

   1. Sur mobile, un glissement vertical veut dire « je fais défiler la
      page » neuf fois sur dix. On n'arme donc le déplacement qu'après
      un appui long — c'est la convention de tous les calendriers
      tactiles. À la souris, on glisse directement.

   2. Une fois armé, il faut empêcher le défilement. `touch-action` est
      évalué au début du geste, donc le changer en cours de route
      n'aide pas : on pose un écouteur `touchmove` NON passif et on
      appelle `preventDefault()`. React attache ses écouteurs tactiles
      en passif, d'où l'`addEventListener` manuel.
   ═══════════════════════════════════════════════════════════════ */

/** Même vocabulaire que `shiftEvent` : un seul endroit décide du sens. */
export type DragMode = ShiftMode;

export type DragState = {
  id: string;
  mode: DragMode;
  /** Décalage appliqué, en minutes, déjà aligné sur le pas. */
  deltaMin: number;
};

/** Pas d'accrochage. Un quart d'heure : assez fin, jamais frustrant. */
const SNAP_MIN = 15;
/** Durée de l'appui long avant d'armer le déplacement, en ms. */
const LONG_PRESS_MS = 320;
/** Au-delà, un mouvement pendant l'appui long est un défilement. */
const SCROLL_TOLERANCE_PX = 10;

export type UseEventDragOptions = {
  /** Conteneur de la grille — porte l'écouteur tactile non passif. */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Appelé au relâchement, avec le décalage retenu. */
  onCommit: (id: string, mode: DragMode, deltaMin: number) => void;
  /** Durée minimale d'un événement, en minutes. */
  minDurationMin?: number;
};

export function useEventDrag({
  containerRef,
  onCommit,
  minDurationMin = 15,
}: UseEventDragOptions) {
  const [drag, setDrag] = useState<DragState | null>(null);

  // Les valeurs de travail vivent dans une ref : les mettre dans le
  // state relancerait un rendu à chaque pixel parcouru.
  const session = useRef<{
    id: string;
    mode: DragMode;
    startY: number;
    armed: boolean;
    timer: ReturnType<typeof setTimeout> | null;
    deltaMin: number;
    durationMin: number;
  } | null>(null);

  const armedRef = useRef(false);

  /* Écouteur tactile non passif : sans lui, le geste fait défiler la
     page en même temps qu'il déplace l'événement. */
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    function onTouchMove(event: TouchEvent) {
      if (armedRef.current) event.preventDefault();
    }

    node.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => node.removeEventListener("touchmove", onTouchMove);
  }, [containerRef]);

  const cancel = useCallback(() => {
    if (session.current?.timer) clearTimeout(session.current.timer);
    session.current = null;
    armedRef.current = false;
    setDrag(null);
  }, []);

  const onPointerDown = useCallback(
    (
      event: React.PointerEvent,
      id: string,
      mode: DragMode,
      durationMin: number,
    ) => {
      // Clic droit ou molette : on ne s'en mêle pas.
      if (event.button !== 0) return;

      const isTouch = event.pointerType === "touch";
      (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);

      session.current = {
        id,
        mode,
        startY: event.clientY,
        armed: !isTouch,
        timer: null,
        deltaMin: 0,
        durationMin,
      };
      armedRef.current = !isTouch;

      if (!isTouch) {
        setDrag({ id, mode, deltaMin: 0 });
        return;
      }

      // Un redimensionnement part d'une poignée minuscule qu'on ne
      // touche pas par hasard : pas besoin d'appui long.
      const delay = mode === "move" ? LONG_PRESS_MS : 0;
      session.current.timer = setTimeout(() => {
        if (!session.current) return;
        session.current.armed = true;
        armedRef.current = true;
        setDrag({ id, mode, deltaMin: 0 });
        // Retour haptique quand l'appareil sait le faire : c'est le
        // signal que l'événement est « décollé ».
        navigator.vibrate?.(8);
      }, delay);
    },
    [],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const current = session.current;
      if (!current) return;

      const dy = event.clientY - current.startY;

      if (!current.armed) {
        // Le doigt bouge avant la fin de l'appui long : c'est un
        // défilement, on abandonne.
        if (Math.abs(dy) > SCROLL_TOLERANCE_PX) cancel();
        return;
      }

      const rawMin = (dy / HOUR_HEIGHT) * 60;
      let deltaMin = Math.round(rawMin / SNAP_MIN) * SNAP_MIN;

      // Un redimensionnement ne doit pas retourner l'événement.
      if (current.mode === "resize-end") {
        deltaMin = Math.max(deltaMin, minDurationMin - current.durationMin);
      } else if (current.mode === "resize-start") {
        deltaMin = Math.min(deltaMin, current.durationMin - minDurationMin);
      }

      if (deltaMin !== current.deltaMin) {
        current.deltaMin = deltaMin;
        setDrag({ id: current.id, mode: current.mode, deltaMin });
      }
    },
    [cancel, minDurationMin],
  );

  const onPointerUp = useCallback(() => {
    const current = session.current;
    if (!current) return;

    const { id, mode, deltaMin, armed } = current;
    cancel();

    // Un relâchement sans déplacement est un tap : c'est à l'appelant
    // de l'interpréter, pas à nous d'inventer une modification.
    if (armed && deltaMin !== 0) onCommit(id, mode, deltaMin);
  }, [cancel, onCommit]);

  return {
    drag,
    /** À étaler sur le conteneur de la grille. */
    containerHandlers: {
      onPointerMove,
      onPointerUp,
      onPointerCancel: cancel,
    },
    onPointerDown,
    /** Vrai pendant un déplacement effectif — sert à ignorer le tap. */
    isDragging: drag !== null,
  };
}
