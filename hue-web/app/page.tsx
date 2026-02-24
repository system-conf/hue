"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, useMotionValue, useTransform, animate, AnimatePresence } from 'framer-motion';

// Color constants
const COLOR_EMPTY = '#121212';
const COLOR_START = '#2ecc71';
const COLOR_MID = '#f1c40f';
const COLOR_END = '#e74c3c';

export default function HueWebTimer() {
  const [isActive, setIsActive] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Core state using MotionValue
  const timeLeft = useMotionValue(0);
  const [displayTime, setDisplayTime] = useState('00:00');

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Sync background color calculation
  const backgroundColor = useTransform(
    timeLeft,
    [0, 600, 1800, 3600],
    [COLOR_EMPTY, COLOR_START, COLOR_MID, COLOR_END]
  );

  // Throttled time display update for UI
  useEffect(() => {
    const unsubscribe = timeLeft.on("change", (latest) => {
      const totalSecs = Math.max(0, Math.floor(latest));
      const m = Math.floor(totalSecs / 60);
      const s = totalSecs % 60;
      const mStr = m.toString().padStart(2, '0');
      const sStr = s.toString().padStart(2, '0');
      const timeStr = `${mStr}:${sStr}`;
      if (displayTime !== timeStr) setDisplayTime(timeStr);
    });
    return () => unsubscribe();
  }, [timeLeft, displayTime]);

  // Precise Frame-based Timer
  useEffect(() => {
    let lastTime = Date.now();
    let frameId: number;

    const step = () => {
      if (isActive && timeLeft.get() > 0) {
        const now = Date.now();
        const delta = (now - lastTime) / 1000;
        lastTime = now;

        const nextTime = Math.max(0, timeLeft.get() - delta);
        timeLeft.set(nextTime);

        if (nextTime <= 0) {
          setIsActive(false);
          const flash = document.getElementById('flash-layer');
          if (flash) {
            flash.animate([
              { opacity: 0 },
              { opacity: 1, offset: 0.1 },
              { opacity: 1, offset: 0.9 },
              { opacity: 0 }
            ], { duration: 1000, iterations: 3 });
          }
          if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
        } else {
          frameId = requestAnimationFrame(step);
        }
      }
    };

    if (isActive) {
      lastTime = Date.now();
      frameId = requestAnimationFrame(step);
    }

    return () => cancelAnimationFrame(frameId);
  }, [isActive, timeLeft]);

  // GLOBAL WHEEL HANDLING
  useEffect(() => {
    const handleGlobalWheel = (e: WheelEvent) => {
      // Don't allow scroll if active? Or allow it to override?
      // Usually better to pause or stop if user interacts
      if (isActive) setIsActive(false);

      e.preventDefault();
      const sensitivity = 0.8;
      const delta = -e.deltaY * sensitivity;
      const currentVal = timeLeft.get();
      const nextVal = Math.max(0, Math.min(3600, currentVal + delta));
      timeLeft.set(nextVal);
    };

    window.addEventListener('wheel', handleGlobalWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleGlobalWheel);
  }, [isActive, timeLeft]);

  // PAN GESTURE (For Dragging/Swiping)
  const handlePan = (event: any, info: any) => {
    if (isActive) setIsActive(false);
    // info.delta.y is negative when moving up
    const sensitivity = 2.0;
    const delta = -info.delta.y * sensitivity;
    const currentVal = timeLeft.get();
    const nextVal = Math.max(0, Math.min(3600, currentVal + delta));
    timeLeft.set(nextVal);
  };

  const handlePointerDown = () => {
    startLongPress();
  };

  const handlePointerUp = () => {
    endLongPress();
  };

  // LONG PRESS / TAP
  const pressTimer = useRef<NodeJS.Timeout | null>(null);
  const isLongPress = useRef(false);

  const startLongPress = () => {
    isLongPress.current = false;
    pressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      setIsActive(false);
      animate(timeLeft, 0, { type: 'spring', damping: 25, stiffness: 120 });
    }, 800);
  };

  const endLongPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    if (!isLongPress.current && timeLeft.get() > 0) {
      setIsActive((prev) => !prev);
    }
  };

  if (!isMounted) return null;

  return (
    <div className="fixed inset-0 overflow-hidden bg-black flex flex-col items-center justify-center select-none touch-none">
      {/* Background Layer controlled by Framer Motion */}
      <motion.div
        style={{ backgroundColor }}
        className="absolute inset-0 pointer-events-none"
      />

      {/* Main interaction layer */}
      <motion.div
        onPan={handlePan}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        className="absolute inset-0 z-10 flex flex-col items-center justify-center cursor-ns-resize"
      >
        {/* Pulse Layer */}
        <AnimatePresence>
          {isActive && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{
                opacity: [0.05, 0.1, 0.05],
                transition: { repeat: Infinity, duration: 2, ease: "easeInOut" }
              }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-white pointer-events-none"
            />
          )}
        </AnimatePresence>

        {/* HUE Branding */}
        <div className="absolute top-12 flex justify-center w-full pointer-events-none">
          <motion.h1
            animate={{ opacity: timeLeft.get() === 0 ? 0.7 : 0.2 }}
            className="text-2xl font-extralight tracking-[0.8em] text-white"
          >
            HUE
          </motion.h1>
        </div>

        {/* Counter UI */}
        <div className="relative pointer-events-none">
          <motion.div
            animate={{
              opacity: timeLeft.get() > 0 ? 1 : 0.15,
              scale: timeLeft.get() > 0 ? 1 : 0.9
            }}
            className="flex flex-col items-center"
          >
            <span className="text-[22vw] sm:text-[16vw] font-extralight tabular-nums text-white leading-none">
              {displayTime}
            </span>
          </motion.div>
        </div>

        {/* Bottom Hint */}
        <div className="absolute bottom-20 flex justify-center w-full pointer-events-none px-12">
          <motion.p
            animate={{ opacity: timeLeft.get() === 0 ? 0.5 : 0 }}
            className="text-xs sm:text-sm font-extralight tracking-[0.4em] text-white uppercase text-center"
          >
            Scroll or Swipe to start
          </motion.p>
        </div>
      </motion.div>

      {/* Final Flash Layer */}
      <div id="flash-layer" className="absolute inset-0 bg-white opacity-0 pointer-events-none z-50" />
    </div>
  );
}
