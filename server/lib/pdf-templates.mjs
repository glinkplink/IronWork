function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function hasText(value) {
  return value != null && String(value).trim() !== '';
}

export function resolvePdfHeaderSlots(body) {
  const headerLeft = hasText(body?.headerLeft)
    ? String(body.headerLeft)
    : hasText(body?.marginHeaderLeft)
      ? String(body.marginHeaderLeft)
      : hasText(body?.workOrderNumber)
        ? String(body.workOrderNumber)
        : '';

  const headerRight = hasText(body?.headerRight)
    ? String(body.headerRight)
    : hasText(body?.headerLeft)
      ? ''
      : hasText(body?.workOrderNumber)
        ? String(body.workOrderNumber)
        : '';

  return { headerLeft, headerRight };
}

export function buildHeaderTemplate(headerLeft = '', headerRight = '') {
  const left = hasText(headerLeft) ? escapeHtml(headerLeft) : '\u00a0';
  const right = hasText(headerRight) ? escapeHtml(headerRight) : '\u00a0';

  return `
    <div style="width:100%; padding:0 40px; box-sizing:border-box; font-family: Arial, sans-serif; color:#aaaaaa; font-size:9px;">
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #cccccc; padding:0 0 4px; width:100%;">
        <span style="flex:1; text-align:left; white-space:nowrap;"><span style="font-size:calc(9px + 1pt);font-weight:700;">${left}</span></span>
        <span style="flex:1; text-align:center; white-space:nowrap; text-transform:uppercase;">Confidential</span>
        <span style="flex:1; text-align:right; white-space:nowrap;"><span style="font-size:calc(9px + 1pt);font-weight:700;">${right}</span></span>
      </div>
      <div style="height:10px;"></div>
    </div>
  `;
}

export function buildFooterTemplate(providerName, providerPhone) {
  const safeBusinessName = escapeHtml((providerName || '').trim());
  const safeProviderPhone = escapeHtml(providerPhone || '');
  let providerText;
  if (safeBusinessName && safeProviderPhone) {
    providerText = `Service Provider - ${safeBusinessName} | ${safeProviderPhone}`;
  } else if (safeBusinessName) {
    providerText = `Service Provider - ${safeBusinessName}`;
  } else if (safeProviderPhone) {
    providerText = `Service Provider | ${safeProviderPhone}`;
  } else {
    providerText = 'Service Provider';
  }

  return `
    <div style="width:100%; padding:0 40px; box-sizing:border-box; font-family: Arial, sans-serif; color:#aaaaaa; font-size:9px;">
      <div style="height:10px;"></div>
      <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid #cccccc; padding:4px 0 0; width:100%;">
        <span style="white-space:nowrap;">${providerText}</span>
        <span style="white-space:nowrap;">Page <span class="pageNumber"></span></span>
      </div>
    </div>
  `;
}
