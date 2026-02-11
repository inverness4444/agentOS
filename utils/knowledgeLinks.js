const attachKnowledgeLink = (links, link) => {
  const list = Array.isArray(links) ? [...links] : [];
  if (link) list.push(link);
  return list;
};

const detachKnowledgeLink = (links, linkId) => {
  const list = Array.isArray(links) ? links : [];
  return list.filter((link) => link && link.id !== linkId);
};

module.exports = { attachKnowledgeLink, detachKnowledgeLink };
