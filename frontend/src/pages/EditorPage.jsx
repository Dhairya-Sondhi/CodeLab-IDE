// src/pages/EditorPage.jsx
import { useParams } from 'react-router-dom';

function EditorPage() {
  const { roomId } = useParams();

  return (
    <div>
      <h1>Editor</h1>
      <p>You are in Room: {roomId}</p>
      <div style={{ border: '1px solid black', height: '70vh', marginTop: '10px' }}>
        {/* The Monaco Editor will go here */}
      </div>
    </div>
  );
}

export default EditorPage;