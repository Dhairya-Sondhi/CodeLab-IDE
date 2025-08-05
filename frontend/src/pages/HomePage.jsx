// src/pages/HomePage.jsx
import { useState } from 'react';
import { v4 as uuidV4 } from 'uuid';
import { useNavigate } from 'react-router-dom';

function HomePage() {
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState('');

  const createNewRoom = (e) => {
    e.preventDefault();
    const id = uuidV4();
    navigate(`/editor/${id}`);
  };

  const joinRoom = () => {
    if (!roomId) {
      alert("Please enter a Room ID");
      return;
    }
    navigate(`/editor/${roomId}`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif' }}>
      <h1>Codelab - Real-time Editor</h1>
      <div style={{ marginBottom: '20px' }}>
        <button onClick={createNewRoom} style={{ padding: '10px 20px', fontSize: '16px' }}>Create a New Room</button>
      </div>
      <div style={{ display: 'flex' }}>
        <input
          type="text"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          placeholder="Enter Room ID"
          style={{ marginRight: '10px', padding: '10px', fontSize: '16px', width: '300px' }}
          onKeyUp={(e) => e.key === 'Enter' && joinRoom()}
        />
        <button onClick={joinRoom} style={{ padding: '10px 20px', fontSize: '16px' }}>Join Room</button>
      </div>
    </div>
  );
}

export default HomePage;