import { createContext } from 'react';
import type { AvailableKnowledgeBase } from '../../api/knowledge';

export const AvailableKnowledgeBasesContext = createContext<Map<string, AvailableKnowledgeBase> | undefined>(undefined);
