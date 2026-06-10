function isTestItem(item) {
  const url = item?.url || '';

  if (!url) {
    return false;
  }

  if (url.includes('benchmark.recall.local')) {
    return true;
  }

  if (url.includes('fail-job-test')) {
    return true;
  }

  if (url.includes('example.com')) {
    return /phase\d|fail-job-test|recall-phase|phase4-note/i.test(url);
  }

  return false;
}

module.exports = {
  isTestItem,
};
