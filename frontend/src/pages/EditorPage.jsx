// src/pages/EditorPage.jsx
import { useParams } from 'react-router-dom';
import Editor from '@monaco-editor/react'; // 1. Import the Editor

function EditorPage() {
  const { roomId } = useParams();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: '10px' }}>
      <div style={{ marginBottom: '10px' }}>
        <h1>Editor</h1>
        <p>You are in Room: {roomId}</p>
      </div>

      {/* 2. Replace the placeholder div with the real Editor component */}
      <div style={{ flex: 1, border: '1px solid #ccc' }}>
        <Editor
          height="100%" // Make the editor fill its container
          theme="vs-dark"
          defaultLanguage="javascript"
          defaultValue="// Your code will appear here..."
        />
      </div>
    </div>
  );
}

export default EditorPage;