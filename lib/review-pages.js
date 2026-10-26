'use strict';
// The review document is a component of the student portal, not a standalone page.
module.exports = function mountReviewPages(app, {path, root}) {
    const redirect = (req, res) => {
        res.set('Cache-Control', 'no-store');
        return res.redirect(302, '/?tab=review');
    };
    const embedded = (req, res) => {
        const destination = req.get('Sec-Fetch-Dest');
        if (req.query.embedded !== '1' || (destination && destination !== 'iframe')) return redirect(req, res);
        res.set('Cache-Control', 'no-store');
        return res.sendFile(path.join(root, 'views/review.html'));
    };
    app.get(['/OT.html', '/OT.html/'], redirect);
    app.get(['/ontap', '/ontap/'], embedded); // Compatibility for an already-open portal.
    app.get('/portal/review', embedded);
};
