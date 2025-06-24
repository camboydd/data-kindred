// utils/sage-intacct-utils.js
export function buildSessionRequestXML({ companyId, userId, senderId, userPassword, senderPassword }) {
    return `
  <request>
    <control>
      <senderid>${senderId}</senderid>
      <password>${senderPassword}</password>
      <controlid>testControl</controlid>
      <uniqueid>false</uniqueid>
      <dtdversion>3.0</dtdversion>
      <includewhitespace>false</includewhitespace>
    </control>
    <operation>
      <authentication>
        <login>
          <userid>${userId}</userid>
          <companyid>${companyId}</companyid>
          <password>${userPassword}</password>
        </login>
      </authentication>
      <content>
        <function controlid="testFunc">
          <getAPISession />
        </function>
      </content>
    </operation>
  </request>
    `.trim();
  }
  
  export function parseSessionResponseXML(xmlString) {
    const match = xmlString.match(/<sessionid>(.*?)<\/sessionid>/);
    return match?.[1] || null;
  }
  