import { create } from 'zustand';
import type { ClienteOutput } from '@adn/shared';

interface ClienteState {
  clienteId: string | null;
  clientes: ClienteOutput[];
  setClienteId: (id: string) => void;
  setClientes: (clientes: ClienteOutput[]) => void;
}

const STORAGE_KEY = 'adn.clienteId';

export const useClienteStore = create<ClienteState>((set) => ({
  clienteId: localStorage.getItem(STORAGE_KEY),
  clientes: [],
  setClienteId: (id) => {
    localStorage.setItem(STORAGE_KEY, id);
    set({ clienteId: id });
  },
  setClientes: (clientes) => set({ clientes }),
}));
