import { useEffect, useRef } from 'react';
import { useWorkflowStore } from '../store/workflowStore';

/**
 * Hook that auto-advances the simulation when in 'auto' mode.
 * Steps through each node with a configurable delay, giving visual feedback.
 */
export function useSimulationRunner() {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const simulation = useWorkflowStore((s) => s.simulation);
  const stepSimulation = useWorkflowStore((s) => s.stepSimulation);
  const resetSimulation = useWorkflowStore((s) => s.resetSimulation);

  useEffect(() => {
    // Only auto-advance when mode is 'auto' and status is 'running'
    if (simulation.status === 'running' && simulation.mode === 'auto') {
      // Start the first step immediately
      stepSimulation();

      // Then auto-advance every 500ms
      timerRef.current = setInterval(() => {
        const current = useWorkflowStore.getState().simulation;
        if (current.status !== 'running') {
          if (timerRef.current) clearInterval(timerRef.current);
          return;
        }
        useWorkflowStore.getState().stepSimulation();
      }, 500);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [simulation.status, simulation.mode, stepSimulation]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return { resetSimulation };
}
