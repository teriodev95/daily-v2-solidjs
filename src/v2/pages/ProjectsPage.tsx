import type { Component } from 'solid-js';
import KanbanBoard from '../components/kanban-v2/KanbanBoard';

interface ProjectsPageProps {
  onCreateStory?: (projectId?: string) => void;
  refreshKey?: number;
  onStoryDeleted?: () => void;
}

const ProjectsPage: Component<ProjectsPageProps> = (props) => (
  <KanbanBoard
    refreshKey={props.refreshKey}
    onStoryDeleted={props.onStoryDeleted}
  />
);

export default ProjectsPage;
