import {
    useEffect,
    useState,
  } from 'react';
  
  import {
    getWorkflows,
  } from '../../api/workflow';
  
  import type {
    Workflow,
  } from '../../types/workflow';
  
  export function WorkflowListPage() {
    const [
      workflows,
      setWorkflows,
    ] = useState<Workflow[]>([]);
  
    const [
      loading,
      setLoading,
    ] = useState(true);
  
    const [
      error,
      setError,
    ] = useState<string | null>(null);
  
    useEffect(() => {
      async function loadWorkflows() {
        try {
          const result =
            await getWorkflows();
  
          setWorkflows(result.items);
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : 'Unknown error',
          );
        } finally {
          setLoading(false);
        }
      }
  
      loadWorkflows();
    }, []);
  
    return (
      <main
        style={{
          maxWidth: 1000,
          margin: '0 auto',
          padding: 32,
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent:
              'space-between',
            marginBottom: 24,
          }}
        >
          <div>
            <h1
              style={{
                marginBottom: 4,
              }}
            >
              Workflows
            </h1>
  
            <div
              style={{
                color: '#666',
              }}
            >
              Build and manage AI workflows.
            </div>
          </div>
  
          <button>
            + Create Workflow
          </button>
        </header>
  
        {loading && (
          <div>Loading...</div>
        )}
  
        {error && (
          <div>{error}</div>
        )}
  
        {!loading &&
          !error &&
          workflows.length === 0 && (
            <div>
              No workflows yet.
            </div>
          )}
  
        <div
          style={{
            display: 'grid',
            gap: 12,
          }}
        >
          {workflows.map(
            (workflow) => (
              <article
                key={workflow.id}
                style={{
                  padding: 20,
                  borderRadius: 12,
                  background: '#fff',
                  border:
                    '1px solid #e5e5e5',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent:
                      'space-between',
                  }}
                >
                  <strong>
                    {workflow.name}
                  </strong>
  
                  <span>
                    {workflow.status}
                  </span>
                </div>
  
                <p
                  style={{
                    marginBottom: 0,
                    color: '#666',
                  }}
                >
                  {workflow.description ??
                    'No description'}
                </p>
              </article>
            ),
          )}
        </div>
      </main>
    );
  }