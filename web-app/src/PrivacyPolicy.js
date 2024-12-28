export default function PrivacyPolicy() {
    return (
        <div className="p-8 text-white">
            <h1 className="text-3xl font-bold mb-4">Privacy Policy</h1>
            <p className="mb-4"><strong>Effective Date:</strong> 28th December 2024</p>

            <h2 className="text-2xl font-semibold mb-2">Introduction</h2>
            <p className="mb-4">Dorky is committed to protecting your privacy. This Privacy Policy outlines our practices regarding the collection, use, and disclosure of information when you use our software.</p>

            <h2 className="text-2xl font-semibold mb-2">Information Collection and Use</h2>
            <p className="mb-4">Dorky does not collect, store, or transmit any personal data from its users. All operations are performed locally on your machine, and any interactions with storage services like AWS S3 or Google Drive are conducted directly between your environment and the respective service.</p>

            <h2 className="text-2xl font-semibold mb-2">Third-Party Services</h2>
            <p className="mb-4">While Dorky facilitates the storage of files on third-party services such as AWS S3 and Google Drive, it does not transmit any data to these services on its own. Users are responsible for configuring and managing their credentials and data with these services.</p>

            <h2 className="text-2xl font-semibold mb-2">Security</h2>
            <p className="mb-4">We prioritize the security of your data. However, it's essential to ensure that your environment and the third-party services you use are properly secured and that you follow best practices for credential management.</p>

            <h2 className="text-2xl font-semibold mb-2">Changes to This Privacy Policy</h2>
            <p className="mb-4">We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on our GitHub repository.</p>

            <h2 className="text-2xl font-semibold mb-2">Contact Us</h2>
            <p className="mb-4">If you have any questions about this Privacy Policy, please contact us through our GitHub repository's issue tracker.</p>
        </div>
    );
}
