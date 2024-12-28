import './App.css';

function App() {
  return (
    <div className="min-h-screen flex flex-col px-8">
      <header className="text-center my-8">
        <h1 className="text-5xl font-bold text-blue-500">Dorky</h1>
        <p className="text-xl text-gray-800 dark:text-gray-300">DevOps Records Keeper</p>
      </header>

      <main className="flex-1 flex flex-col items-center">
        <section className="my-8 w-full max-w-3xl">
          <h2 className="text-3xl text-blue-500 border-b-2 border-blue-500 pb-2 mb-4">Features</h2>
          <ul className="list-none p-0 space-y-4">
            <li className="text-lg text-gray-800 dark:text-gray-300">
              <strong className="text-blue-500">Secure Storage:</strong> Safeguard your project’s confidential files by storing them in AWS S3 or Google Drive.
            </li>
            <li className="text-lg text-gray-800 dark:text-gray-300">
              <strong className="text-blue-500">Easy Integration:</strong> Seamlessly integrate Dorky into your project with simple initialization commands.
            </li>
            <li className="text-lg text-gray-800 dark:text-gray-300">
              <strong className="text-blue-500">File Management:</strong> Effortlessly list, add, remove, push, and pull files between your project and the storage service.
            </li>
            <li className="text-lg text-gray-800 dark:text-gray-300">
              <strong className="text-blue-500">Customizable Exclusions:</strong> Use the .dorkyignore file to specify patterns for files or folders to exclude from operations.
            </li>
          </ul>
        </section>

        <section className="my-8 w-full max-w-3xl">
          <h2 className="text-3xl text-blue-500 border-b-2 border-blue-500 pb-2 mb-4">How it Works</h2>
          <div className="flex flex-col items-center space-y-8">
            <div className="card w-full"><img alt="AWS" src="https://github.com/trishantpahwa/dorky/raw/main/dorky-usage-aws.svg" /><p className="text-lg text-gray-800 dark:text-gray-300 mt-4">
              Dorky integrates seamlessly with AWS S3 for secure storage of your project files.
            </p>
            </div>
            <div className="card w-full"><img alt="Google-Drive" src="https://github.com/trishantpahwa/dorky/raw/main/dorky-usage-google-drive.svg" /><p className="text-lg text-gray-800 dark:text-gray-300 mt-4">
              Dorky can also leverage Google Drive for convenient file management.
            </p>
            </div>
          </div>
        </section>

        <section className="my-8 w-full max-w-3xl">
          <h2 className="text-3xl text-blue-500 border-b-2 border-blue-500 pb-2 mb-4">Getting Started</h2>
          <ol className="list-none p-0 space-y-4">
            <li className="text-lg text-gray-800 dark:text-gray-300">
              <strong>Installation:</strong>
              <pre className="bg-gray-100 dark:bg-gray-800 p-2 rounded"><code>npm install -g dorky</code></pre>
            </li>
            <li className="text-lg text-gray-800 dark:text-gray-300">
              <strong>Initialize Dorky:</strong>
              <pre className="bg-gray-100 dark:bg-gray-800 p-2 rounded"><code>dorky --init aws</code></pre>
            </li>
            <li className="text-lg text-gray-800 dark:text-gray-300">
              <strong>Manage Files:</strong>
              <ul className="list-disc ml-6 space-y-2">
                <li>List files: <code className="bg-gray-100 dark:bg-gray-800 p-1 rounded">dorky --list</code></li>
                <li>Add a file: <code className="bg-gray-100 dark:bg-gray-800 p-1 rounded">dorky --add &lt;file-name&gt;</code></li>
                <li>Push files: <code className="bg-gray-100 dark:bg-gray-800 p-1 rounded">dorky --push</code></li>
                <li>Remove a file: <code className="bg-gray-100 dark:bg-gray-800 p-1 rounded">dorky --rm &lt;file-name&gt;</code></li>
                <li>Pull files: <code className="bg-gray-100 dark:bg-gray-800 p-1 rounded">dorky --pull</code></li>
              </ul>
            </li>
          </ol>
        </section>

        <section className="my-8 w-full max-w-3xl">
          <h2 className="text-3xl text-blue-500 border-b-2 border-blue-500 pb-2 mb-4">Learn More</h2>
          <ul className="list-none p-0 space-y-2">
            <li><a className="text-blue-500 hover:underline" href="https://www.npmjs.com/package/dorky" target="_blank" rel="noopener noreferrer">npm Package</a></li>
            <li><a className="text-blue-500 hover:underline" href="https://github.com/trishantpahwa/dorky" target="_blank" rel="noopener noreferrer">GitHub Repository</a></li>
          </ul>
        </section>
      </main>

      <footer className="text-center py-4 border-t border-gray-200 dark:border-gray-700">
        <p className="text-gray-600 dark:text-gray-400 text-sm">© 2024 Dorky - Open-Source DevOps Records Keeper</p>
      </footer>
    </div>
  );
}

export default App;
