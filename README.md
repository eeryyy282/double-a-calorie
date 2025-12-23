<h1 align="center">🥑 Double A Calorie (A2Bot)</h1>

<blockquote align="center">
  <p><strong>A2Bot</strong> is an AI-powered WhatsApp assistant that helps track daily calories automatically through natural conversation in group chats.</p>
</blockquote>

<p align="center">
  This project is built to facilitate diet tracking without the need to open a separate app. Simply chat "Ate fried rice", and the AI will estimate the calories for you.
</p>

<hr>

<h2>✨ Key Features</h2>
<ul>
  <li><strong>🧠 AI-Powered Tracking:</strong> Uses Google Gemini 2.5 Flash to recognize food types and estimate calories from everyday language.</li>
  <li><strong>💬 WhatsApp Integration:</strong> Runs directly in WhatsApp Groups or Personal Chats.</li>
  <li><strong>👥 Multi-User Support:</strong> Distinguishes tracking for each group member (e.g., You and your Partner).</li>
  <li><strong>📊 Real-time Database:</strong> Stores daily progress using a simple JSON database (easy to upgrade to Firestore/PostgreSQL).</li>
  <li><strong>⚡ Fast Response:</strong> Lightweight and fast using the <code>@whiskeysockets/baileys</code> library.</li>
</ul>

<h2>🛠️ Technology Used</h2>
<ul>
  <li><a href="https://nodejs.org/">Node.js</a> - Runtime environment.</li>
  <li><a href="https://github.com/WhiskeySockets/Baileys">Baileys</a> - WhatsApp Web API Library (Unofficial).</li>
  <li><a href="https://ai.google.dev/">Google Generative AI</a> - The brain behind calorie estimation.</li>
</ul>

<h2>🚀 Installation & Running</h2>
<p>Follow these steps to run the bot on your local computer or server.</p>

<h3>Prerequisites</h3>
<ol>
  <li>Node.js installed on your computer.</li>
  <li>API Key from <a href="https://aistudio.google.com/">Google AI Studio</a>.</li>
</ol>

<h3>Steps</h3>

<p><strong>1. Clone Repository</strong></p>
<pre><code>git clone https://github.com/eeryyy282/double-a-calorie.git
cd double-a-calorie</code></pre>

<p><strong>2. Install Dependencies</strong></p>
<pre><code>npm install</code></pre>

<p><strong>3. Configure API Key</strong></p>
<p>Open the <code>index.js</code> file and fill in the <code>API_KEY</code> variable with your Gemini API key:</p>
<pre><code>const API_KEY = "INSERT_YOUR_GEMINI_KEY_HERE";</code></pre>

<p><strong>4. Run Bot</strong></p>
<pre><code>node index.js</code></pre>

<p><strong>5. Scan QR Code</strong></p>
<p>The terminal will display a QR Code. Open WhatsApp on your phone (a dedicated bot number is recommended), go to <strong>Linked Devices</strong>, and scan the QR code.</p>

<h2>📱 Usage</h2>
<p>Once the bot is connected (<code>✅ A2Bot connected to WhatsApp!</code>), you can start using it immediately.</p>

<ol>
  <li><strong>Start:</strong> Send any message (e.g., "Hello") to the bot number. The bot will automatically create your profile with a default target.</li>
  <li><strong>Input Food:</strong>
    <ul>
      <li><em>"Lunch with chicken soup and half a portion of rice"</em></li>
      <li><em>"Just drank iced coffee with brown sugar"</em></li>
      <li><em>"Snacking on one fried banana"</em></li>
    </ul>
  </li>
  <li><strong>Response:</strong> A2Bot will reply with the calorie estimation and your remaining calorie allowance for the day.</li>
</ol>

<h2>⚠️ Disclaimer</h2>
<p>This project uses an Unofficial WhatsApp library (Baileys). Use wisely. There is a risk of the WhatsApp number being banned if used for spamming. Using a secondary number is recommended. Communication and UI messages still use Bahasa Indonesia. The language can be changed in the variable found in the code.</p>

<br>
<p align="center">Made with ❤️ by <strong>Airi & Azviore</strong></p>