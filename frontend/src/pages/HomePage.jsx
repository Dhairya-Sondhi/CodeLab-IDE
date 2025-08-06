// src/pages/HomePage.jsx
import { useState } from 'react';
import { v4 as uuidV4 } from 'uuid';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import '../styles/home.css';

function HomePage() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [roomId, setRoomId] = useState('');
  const [loading, setLoading] = useState(false);

  const createNewRoom = async (e) => {
    e.preventDefault();
    setLoading(true);
    const id = uuidV4();
    // Add a small delay to show loading state
    setTimeout(() => {
      navigate(`/editor/${id}`);
      setLoading(false);
    }, 500);
  };

  const joinRoom = () => {
    if (!roomId.trim()) {
      alert("Please enter a Room ID");
      return;
    }
    navigate(`/editor/${roomId.trim()}`);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="home-container">
      {/* Header */}
      <header className="home-header">
        <div className="header-content">
          <h1 className="home-title">CodeLab IDE</h1>
          <div className="user-info">
            <span className="welcome-text">
              Welcome, <strong>{user?.user_metadata?.username || user?.email}</strong>
            </span>
            <Button 
              onClick={handleSignOut}
              variant="secondary"
              className="sign-out-btn"
            >
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="home-main">
        <div className="home-content">
          <div className="hero-section">
            <h2 className="hero-title">Collaborative Code Editor</h2>
            <p className="hero-description">
              Create or join a coding room and collaborate with others in real-time
            </p>
          </div>

          <div className="actions-container">
            {/* Create New Room */}
            <div className="action-card">
              <h3 className="card-title">Create New Room</h3>
              <p className="card-description">
                Start a new collaborative coding session
              </p>
              <Button 
                onClick={createNewRoom}
                loading={loading}
                className="action-button create-btn"
              >
                Create Room
              </Button>
            </div>

            {/* Join Existing Room */}
            <div className="action-card">
              <h3 className="card-title">Join Existing Room</h3>
              <p className="card-description">
                Enter a room ID to join an existing session
              </p>
              <div className="join-form">
                <Input
                  type="text"
                  placeholder="Enter Room ID"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && joinRoom()}
                  className="room-input"
                />
                <Button 
                  onClick={joinRoom}
                  className="action-button join-btn"
                >
                  Join Room
                </Button>
              </div>
            </div>
          </div>

          {/* Features Section */}
          <div className="features-section">
            <h3 className="features-title">Features</h3>
            <div className="features-grid">
              <div className="feature-item">
                <div className="feature-icon">⚡</div>
                <div className="feature-text">
                  <h4>Real-time Collaboration</h4>
                  <p>Code together with multiple users simultaneously</p>
                </div>
              </div>
              <div className="feature-item">
                <div className="feature-icon">🎨</div>
                <div className="feature-text">
                  <h4>Syntax Highlighting</h4>
                  <p>Support for multiple programming languages</p>
                </div>
              </div>
              <div className="feature-item">
                <div className="feature-icon">▶️</div>
                <div className="feature-text">
                  <h4>Code Execution</h4>
                  <p>Run your code directly in the browser</p>
                </div>
              </div>
              <div className="feature-item">
                <div className="feature-icon">💾</div>
                <div className="feature-text">
                  <h4>Auto Save</h4>
                  <p>Your code is automatically saved and synced</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default HomePage;
