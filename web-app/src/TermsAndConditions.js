import React from 'react';

export default function TermsAndConditions() {
    return (
        <div className="p-6 shadow-md rounded-lg">
            <h1 className="text-2xl font-bold mb-4">Terms and Conditions</h1>
            <p className="mb-2"><strong>Effective Date:</strong> 28th December 2024</p>

            <h2 className="text-xl font-semibold mt-4 mb-2">Acceptance of Terms</h2>
            <p className="mb-2">By using Dorky, you agree to comply with and be bound by these Terms and Conditions. If you do not agree, please do not use the software.</p>

            <h2 className="text-xl font-semibold mt-4 mb-2">License</h2>
            <p className="mb-2">Dorky is licensed under the <strong> MIT License</strong>. You may use, distribute, and modify the software in accordance with the terms of this license.</p>

            <h2 className="text-xl font-semibold mt-4 mb-2">Usage Restrictions</h2>
            <ul className="list-disc list-inside mb-2">
                <li>Do not use Dorky for any illegal or unauthorized purposes.</li>
                <li>Ensure that your use of Dorky does not violate any applicable laws or regulations.</li>
            </ul>

            <h2 className="text-xl font-semibold mt-4 mb-2">Limitation of Liability</h2>
            <p className="mb-2">Dorky is provided "as is," without warranty of any kind. In no event shall the authors or copyright holders be liable for any claim, damages, or other liability arising from the use of the software.</p>

            <h2 className="text-xl font-semibold mt-4 mb-2">User Responsibilities</h2>
            <ul className="list-disc list-inside mb-2">
                <li>Maintain the confidentiality of any credentials used with Dorky.</li>
                <li>Ensure that you have the necessary permissions to store and manage files on third-party services.</li>
            </ul>

            <h2 className="text-xl font-semibold mt-4 mb-2">Modifications to the Software</h2>
            <p className="mb-2">We reserve the right to modify, suspend, or discontinue Dorky at any time without prior notice.</p>

            <h2 className="text-xl font-semibold mt-4 mb-2">Governing Law</h2>
            <p className="mb-2">These Terms and Conditions are governed by and construed in accordance with the laws of <strong>[Insert Jurisdiction]</strong>.</p>

            <h2 className="text-xl font-semibold mt-4 mb-2">Contact Information</h2>
            <p className="mb-2">For any questions or concerns regarding these Terms and Conditions, please reach out via the issue tracker on our GitHub repository.</p>

        </div>
    );
}
