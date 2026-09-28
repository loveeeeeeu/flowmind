import type {
    WorkflowListResponse,
  } from '../types/workflow';
  
  const API_BASE_URL =
    'http://localhost:3000';
  
  export async function getWorkflows(
    page = 1,
    pageSize = 10,
    keyword = '',
  ): Promise<WorkflowListResponse> {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
  
    if (keyword) {
      params.set('keyword', keyword);
    }
  
    const response = await fetch(
      `${API_BASE_URL}/workflows?${params.toString()}`,
    );
  
    if (!response.ok) {
      throw new Error(
        'Failed to fetch workflows',
      );
    }
  
    return response.json();
  }